#!/usr/bin/env python3
"""
Song & Chord Lab - Build Script
Encrypts all app JS files into a single encrypted bundle.

Usage:
  CHORD_LAB_MASTER_KEY_B64="base64-encoded-32-byte-key" python3 build.py

The app bundle is encrypted with a master key stored outside the public site.
For production, keep CHORD_LAB_MASTER_KEY_B64 in the backend secret store
(Supabase Edge Function secrets), not in GitHub Pages.
"""

import os
import sys
import json
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# JS files to encrypt (order matters - matches script tag order in index.html)
JS_FILES = [
    'js/music-theory.js',
    'js/chord-db.js',
    'js/renderers.js',
    'js/musicxml-parser.js',
    'js/pdf-parser.js',
    'js/itunes-search.js',
    'js/export.js',
    'js/db.js',
    'js/app.js',
]

OUTPUT_FILE = 'js/app.encrypted'


def get_master_key():
    """Read the AES-256 master key from the environment."""
    if len(sys.argv) > 1:
        print('Error: too many arguments', file=sys.stderr)
        print_usage()
        sys.exit(2)

    key_b64 = os.environ.get('CHORD_LAB_MASTER_KEY_B64')
    if not key_b64:
        print('Error: CHORD_LAB_MASTER_KEY_B64 is required.', file=sys.stderr)
        print_usage()
        sys.exit(2)

    try:
        key = base64.b64decode(key_b64, validate=True)
    except ValueError as exc:
        print(f'Error: CHORD_LAB_MASTER_KEY_B64 is not valid base64: {exc}', file=sys.stderr)
        sys.exit(2)

    if len(key) != 32:
        print('Error: CHORD_LAB_MASTER_KEY_B64 must decode to exactly 32 bytes.', file=sys.stderr)
        sys.exit(2)

    return key


def print_usage():
    print(
        'Usage:\n'
        '  CHORD_LAB_MASTER_KEY_B64="base64-encoded-32-byte-key" python3 build.py',
        file=sys.stderr,
    )


def encrypt_aes_gcm(key_bytes, plaintext_bytes):
    """Encrypt with AES-256-GCM. Returns (iv, ciphertext+tag)."""
    iv = os.urandom(12)  # 96-bit IV for GCM
    aesgcm = AESGCM(key_bytes)
    ct = aesgcm.encrypt(iv, plaintext_bytes, None)  # ct includes auth tag
    return iv, ct


def main():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    master_key = get_master_key()
    print('Using master key from CHORD_LAB_MASTER_KEY_B64')

    # 1. Read and concatenate all JS files
    code_parts = []
    for js_file in JS_FILES:
        filepath = os.path.join(project_dir, js_file)
        if not os.path.exists(filepath):
            print(f'Error: {js_file} not found')
            sys.exit(1)
        with open(filepath, 'r', encoding='utf-8') as f:
            code_parts.append(f.read())

    app_code = '\n'.join(code_parts)
    print(f'Concatenated {len(JS_FILES)} JS files ({len(app_code):,} bytes)')

    # 2. Encrypt app code with backend-managed master key
    app_iv, app_encrypted = encrypt_aes_gcm(master_key, app_code.encode('utf-8'))

    # 3. Build output JSON
    # Format compatible with Web Crypto API (AES-GCM ciphertext includes 16-byte auth tag)
    result = {
        'app': {
            'iv': base64.b64encode(app_iv).decode(),
            'data': base64.b64encode(app_encrypted).decode(),
        },
    }

    output_path = os.path.join(project_dir, OUTPUT_FILE)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f)

    file_size = os.path.getsize(output_path)
    print(f'Encrypted to {OUTPUT_FILE} ({file_size:,} bytes)')
    print('Done!')


if __name__ == '__main__':
    main()
