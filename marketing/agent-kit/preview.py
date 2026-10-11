#!/usr/bin/env python3
"""Local static preview with byte-range support for video seeking. Not a production server."""
import argparse
import http.server
import pathlib
import re
import shutil


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(pathlib.Path(__file__).parent), **kwargs)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self.selected_range = None
        requested = self.headers.get('Range')
        path = pathlib.Path(self.translate_path(self.path))
        if not requested or not path.is_file():
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
        size = path.stat().st_size
        if match and any(match.groups()):
            left, right = match.groups()
            start = int(left) if left else max(0, size-int(right))
            end = min(size-1, int(right)) if left and right else size-1
            if 0 <= start <= end < size:
                source = path.open('rb')
                source.seek(start)
                self.selected_range = (start, end)
                self.send_response(206)
                self.send_header('Content-Type', self.guess_type(str(path)))
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(end-start+1))
                self.end_headers()
                return source
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return None

    def copyfile(self, source, outputfile):
        try:
            if self.selected_range is None:
                shutil.copyfileobj(source, outputfile)
                return
            remaining = self.selected_range[1]-self.selected_range[0]+1
            while remaining:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            # Browsers routinely close an in-progress read after a seek.
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), PreviewHandler)
    print(f'Agent Kit landing page: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
