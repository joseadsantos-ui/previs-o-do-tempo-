// Service worker: guarda os arquivos do app para abrir mesmo sem internet.
// Troque o número da versão sempre que alterar algum arquivo do projeto.
const VERSAO = "clima-v2";
const ARQUIVOS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);

  // Só mexe nos arquivos do próprio app. As chamadas à API do clima
  // (outro domínio) passam direto: sem internet, o script mostra a mensagem
  // de erro de conexão em vez de um clima antigo guardado.
  if (pedido.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Rede primeiro (sempre a versão mais nova); se falhar, usa o cache.
  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((cache) => cache.put(pedido, copia));
        return resposta;
      })
      .catch(() =>
        caches.match(pedido).then((guardado) => guardado || caches.match("index.html"))
      )
  );
});
