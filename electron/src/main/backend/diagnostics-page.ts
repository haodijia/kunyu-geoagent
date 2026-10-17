const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <title>后端启动失败 · 坤舆</title>
    <style>
      :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07111f; color: #e7edf5; }
      main { width: min(760px, calc(100vw - 48px)); padding: 32px; border: 1px solid #27364a; border-radius: 16px; background: #0d1a2b; box-shadow: 0 24px 80px #0008; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .summary { margin: 0 0 24px; color: #aab8ca; line-height: 1.6; }
      dl { display: grid; grid-template-columns: 110px 1fr; gap: 10px 16px; margin: 0 0 20px; }
      dt { color: #7f91a8; }
      dd { margin: 0; overflow-wrap: anywhere; }
      pre { min-height: 120px; max-height: 280px; overflow: auto; padding: 16px; border-radius: 10px; background: #050b13; color: #b8c8dc; white-space: pre-wrap; word-break: break-word; }
      footer { display: flex; align-items: center; gap: 16px; margin-top: 20px; }
      button { border: 0; border-radius: 9px; padding: 10px 18px; background: #3b82f6; color: white; font: inherit; font-weight: 600; cursor: pointer; }
      button:disabled { cursor: wait; opacity: .55; }
      #status { color: #93a4b8; }
    </style>
  </head>
  <body>
    <main>
      <h1>后端启动失败</h1>
      <p class="summary">坤舆无法连接本地服务。请查看诊断信息，修复问题后手动重试。</p>
      <dl>
        <dt>错误类型</dt><dd id="type"></dd>
        <dt>退出码</dt><dd id="exit-code"></dd>
        <dt>错误信息</dt><dd id="message"></dd>
      </dl>
      <pre id="logs" aria-label="最近的后端日志"></pre>
      <footer>
        <button id="retry" type="button">重新启动后端</button>
        <span id="status" role="status"></span>
      </footer>
    </main>
    <script>
      const bridge = window.kunyuDiagnostics;
      const retryButton = document.getElementById("retry");
      const status = document.getElementById("status");

      function render(failure) {
        document.getElementById("type").textContent = failure.type;
        document.getElementById("exit-code").textContent = failure.exitCode === null ? "无" : String(failure.exitCode);
        document.getElementById("message").textContent = failure.message;
        document.getElementById("logs").textContent = failure.logs.length === 0 ? "无可用日志" : failure.logs.join("\\n");
      }

      render(bridge.failure);
      retryButton.addEventListener("click", async () => {
        retryButton.disabled = true;
        status.textContent = "正在重新启动…";
        try {
          const result = await bridge.retry();
          if (!result.ok) {
            render(result.failure);
            status.textContent = result.busy ? "重试正在进行中" : "重试失败，请检查新日志";
            retryButton.disabled = result.busy;
            if (!result.busy) retryButton.disabled = false;
          }
        } catch {
          status.textContent = "重试请求失败";
          retryButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

export const BACKEND_DIAGNOSTICS_PAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
