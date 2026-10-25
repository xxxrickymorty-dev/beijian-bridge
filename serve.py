"""开发服务器：同 http.server，但对所有响应加 no-store，改完代码刷新即生效。

请求日志写到 serve.log（不占终端、不依赖外部管道），避免后台管道断开导致进程退出。

用法（项目根目录）：
    python serve.py 8766

端口被占用时：netstat -ano | findstr :8766 找到 PID，taskkill /F /PID <pid> 后重试。
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        try:
            with open("serve.log", "a", encoding="utf-8") as f:
                f.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))
        except OSError:
            pass  # 日志写不进去也不能影响服务


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print("serving . on http://localhost:%d (no-store, logs -> serve.log)" % port)
    try:
        ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
    except OSError as e:
        print("端口 %d 起不来：%s" % (port, e))
        print("先结束占用它的 python 进程：netstat -ano | findstr :%d" % port)
        sys.exit(1)
