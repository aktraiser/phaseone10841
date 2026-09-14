"""Bounded framing shared by the guest and controller."""
import json, struct
MAX_FRAME = 16 * 1024 * 1024

def exact(sock, size):
    data = bytearray()
    while len(data) < size:
        block = sock.recv(size - len(data))
        if not block:
            raise ValueError('Truncated frame')
        data.extend(block)
    return bytes(data)

def receive(sock):
    size = struct.unpack('!I', exact(sock, 4))[0]
    if size > MAX_FRAME:
        raise ValueError('Frame too large')
    value = json.loads(exact(sock, size))
    if not isinstance(value, dict):
        raise ValueError('Expected object')
    return value

def send(sock, value):
    data = json.dumps(value, ensure_ascii=True).encode()
    if len(data) > MAX_FRAME:
        raise ValueError('Frame too large')
    sock.sendall(struct.pack('!I', len(data)) + data)
