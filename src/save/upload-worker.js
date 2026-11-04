// Envia um save ao servidor fora da thread principal: mandar vários MB pelo
// fetch na página trava a tela por um instante. Recebe { n, url, body } (body:
// ArrayBuffer transferido, sem cópia) e responde { n, ok, status, body }.

self.onmessage = async ({ data: { n, url, body } }) => {
  try {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    let reply = null;
    if (!res.ok) {
      try {
        reply = await res.json();
      } catch {
        // Resposta sem JSON.
      }
    }
    self.postMessage({ n, ok: res.ok, status: res.status, body: reply });
  } catch (error) {
    self.postMessage({ n, ok: false, status: 0, body: { error: String(error?.message ?? error) } });
  }
};
