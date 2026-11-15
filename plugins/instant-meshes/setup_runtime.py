import hashlib
import io
import os
from pathlib import Path
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
URL = "https://instant-meshes.s3.eu-central-1.amazonaws.com/Release/instant-meshes-windows.zip"
ARCHIVE_SIZE = 1401791
ARCHIVE_SHA256 = "c9f6217e83ea90f98a8cd54cf82dac88420df20cf197e7a4ef2bef81c5ae068d"
BINARY_SIZE = 3449856
BINARY_SHA256 = "f1fe5b5f56d1002ae61dbd76a3fd646229fc1fe15322e7a3744f8ce442c76b2d"
BINARY = ROOT / "InstantMeshes.exe"


def verified_binary():
    if BINARY.is_symlink() or not BINARY.is_file() or BINARY.stat().st_size != BINARY_SIZE or hashlib.sha256(BINARY.read_bytes()).hexdigest() != BINARY_SHA256:
        raise ValueError("instant-meshes-missing")
    return BINARY


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        raise ValueError("instant-meshes-download-redirect")


def prepare():
    if sys.platform != "win32":
        raise ValueError("platform-unsupported")
    if BINARY.exists():
        try:
            return verified_binary()
        except ValueError:
            pass
    request = urllib.request.Request(URL, headers={"User-Agent": "Forma-Instant-Meshes"})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
        data = response.read(ARCHIVE_SIZE + 1)
    if len(data) != ARCHIVE_SIZE or hashlib.sha256(data).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("instant-meshes-checksum")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.namelist() != ["Instant Meshes.exe"] or archive.infolist()[0].file_size != BINARY_SIZE:
            raise ValueError("instant-meshes-archive")
        executable = archive.read("Instant Meshes.exe")
    if len(executable) != BINARY_SIZE or hashlib.sha256(executable).hexdigest() != BINARY_SHA256:
        raise ValueError("instant-meshes-checksum")
    pending = ROOT / "InstantMeshes.download"
    try:
        pending.write_bytes(executable)
        os.replace(pending, BINARY)
    finally:
        pending.unlink(missing_ok=True)
    return verified_binary()


if __name__ == "__main__":
    print(prepare())
