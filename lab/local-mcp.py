#!/usr/bin/env python3
"""Connect to the existing local Lima lab without putting keys in MCP arguments."""
import os
from pathlib import Path
os.environ['PHASEONE_LAB_KEY']=(Path(__file__).resolve().parent/'.local/key').read_text().strip()
os.environ['PHASEONE_LAB_URL']='http://127.0.0.1:18081'
from mcp import main
main()
