#!/usr/bin/env python3
"""
Song & Chord Lab - Build Script
Encrypts all app JS files into a single encrypted bundle.

Usage:
  python3 build.py              # uses default password
  python3 build.py "mypassword" # custom password

Two-layer encryption:
  1. Random master key encrypts all JS code (AES-256-GCM)
  2. Password encrypts the master key (PBKDF2 + AES-256-GCM)

This allows password changes without re-encrypting the entire app.
"""

import os
import sys
import json
import base64
import hashlib
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

PBKDF2_ITERATIONS = 100000
OUTPUT_FILE = 'js/app.encrypted'


def encrypt_aes_gcm(key_bytes, plaintext_bytes):
    """Encrypt with AES-256-GCM. Returns (iv, ciphertext+tag)."""
    iv = os.urandom(12)  # 96-bit IV for GCM
    aesgcm = AESGCM(key_bytes)
    ct = aesgcm.encrypt(iv, plaintext_bytes, None)  # ct includes auth tag
    return iv, ct


def main():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    password = sys.argv[1] if len(sys.argv) > 1 else 'qerw1212@@'

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

    # 2. Generate random master key (256-bit)
    master_key = os.urandom(32)

    # 3. Encrypt app code with master key
    app_iv, app_encrypted = encrypt_aes_gcm(master_key, app_code.encode('utf-8'))

    # 4. Derive key from password using PBKDF2
    mk_salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac(
        'sha256', password.encode('utf-8'), mk_salt, PBKDF2_ITERATIONS, dklen=32
    )

    # 5. Encrypt master key with password-derived key
    mk_iv, mk_encrypted = encrypt_aes_gcm(derived_key, master_key)

    # 6. Build output JSON
    # Format compatible with Web Crypto API (AES-GCM ciphertext includes 16-byte auth tag)
    result = {
        'mk': {
            'salt': base64.b64encode(mk_salt).decode(),
            'iv': base64.b64encode(mk_iv).decode(),
            'data': base64.b64encode(mk_encrypted).decode(),
        },
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
