"""Trusted E2B command supervisor. Invoked only inside the sandbox by the controller."""
import json,os,resource,selectors,signal,subprocess,time
from pathlib import Path
MAX_OUTPUT=128*1024
def child_limits():
    os.setgroups([])
    os.setgid(65534)
    os.setuid(65534)
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.umask(0o077)


def execute(request):
    if request.get("protocol") != 1 or not isinstance(request.get("request_id"), str):
        raise ValueError("invalid protocol")
    code = request.get("code")
    timeout = request.get("timeout_ms")
    maximum = request.get("max_output_bytes")
    if not isinstance(code, str) or len(code.encode()) > 256 * 1024:
        raise ValueError("invalid code size")
    if type(timeout) is not int or not 0 < timeout <= 30000:
        raise ValueError("invalid timeout")
    if type(maximum) is not int or not 0 < maximum <= MAX_OUTPUT:
        raise ValueError("invalid output limit")
    response = dict(protocol=1, request_id=request["request_id"], exit_code=-1,
                    stdout="", stderr="", error=None)
    process = subprocess.Popen(["/bin/sh", "-c", code], stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               cwd="/workspace", start_new_session=True,
                               preexec_fn=child_limits,
                               env={"PATH": "/tools:/usr/local/bin:/usr/bin:/bin", "HOME": "/workspace",
                                    "TMPDIR": "/tmp", "PYTHONDONTWRITEBYTECODE": "1"})
    streams = selectors.DefaultSelector()
    outputs = {"stdout": bytearray(), "stderr": bytearray()}
    streams.register(process.stdout, selectors.EVENT_READ, "stdout")
    streams.register(process.stderr, selectors.EVENT_READ, "stderr")
    deadline = time.monotonic() + timeout / 1000
    try:
        while streams.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                response["error"] = "timeout"
                break
            for key, _ in streams.select(min(remaining, .05)):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    streams.unregister(key.fileobj)
                    continue
                if sum(len(value) for value in outputs.values()) + len(chunk) > maximum:
                    response["error"] = "output limit exceeded"
                    break
                outputs[key.data].extend(chunk)
            if response["error"]:
                break
        if response["error"] is None:
            try:
                response["exit_code"] = process.wait(timeout=max(.001, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                response["error"] = "timeout"
    finally:
        # The host also destroys the entire microVM; detached processes cannot
        # survive the host's VM deadline even if they escape this process group.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        streams.close()
        process.stdout.close()
        process.stderr.close()
    for stream, value in outputs.items():
        response[stream] = value.decode("utf-8", errors="replace")
    # UTF-8 replacement can expand the byte count: enforce the wire result cap.
    if len(response["stdout"].encode()) + len(response["stderr"].encode()) > maximum:
        response.update(stdout="", stderr="", error="output limit exceeded")
    return response


if __name__=='__main__':
    if os.geteuid()!=0 or not Path('/opt/phaseone/ready').is_file():raise SystemExit('Prepared E2B sandbox required')
    request=json.loads(Path('/opt/phaseone/command.json').read_text())
    print(json.dumps(execute(request)))
