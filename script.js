// ============================================
// 1. CONFIGURAÇÃO DA API — wttr.in (não exige chave)
// ============================================
// A wttr.in aceita o nome da cidade direto na URL e devolve tudo em uma
// única requisição (formato j1 = JSON): local, clima atual e nascer/pôr
// do sol. Não há etapa de geocodificação.
const CLIMA_URL = "https://wttr.in";

// ============================================
// 2. ELEMENTOS DA PÁGINA
// ============================================
const botaoBuscar = document.getElementById("buscar");
const campoCidade = document.getElementById("cidade");
const resultado = document.getElementById("resultado");
const historico = document.getElementById("historico");
const listaHistorico = document.getElementById("listaHistorico");

// ============================================
// MELHORIA 1 — tradução do weatherCode
// A wttr.in devolve um código numérico (padrão World Weather Online) e
// uma descrição, que pedimos em português com lang=pt. Esta função
// agrupa os códigos em categorias para escolher o desenho e o fundo.
// ============================================
const CODIGOS_NEVOEIRO = [143, 248, 260];
const CODIGOS_NEVE = [179, 182, 227, 230, 317, 320, 323, 326, 329, 332, 335,
  338, 350, 362, 365, 368, 371, 374, 377];
const CODIGOS_TROVOADA = [200, 386, 389, 392, 395];

function categoria(codigo) {
  codigo = Number(codigo);
  if (codigo === 113) return "limpo";
  if (codigo === 116) return "parcial";
  if (codigo === 119 || codigo === 122) return "nublado";
  if (CODIGOS_NEVOEIRO.includes(codigo)) return "nevoeiro";
  if (CODIGOS_NEVE.includes(codigo)) return "neve";
  if (CODIGOS_TROVOADA.includes(codigo)) return "trovoada";
  return "chuva";
}

// Texto da condição: usa a descrição em português da API.
function descreverTempo(atual) {
  const pt = atual.lang_pt && atual.lang_pt[0] && atual.lang_pt[0].value;
  const en = atual.weatherDesc && atual.weatherDesc[0] && atual.weatherDesc[0].value;
  return pt || en || "Condição não identificada";
}

// A API devolve horas como "06:03 AM". Converte para minutos do dia.
function paraMinutos(texto) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((texto || "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

// Dia ou noite: compara a hora da medição com nascer e pôr do sol.
function eDia(atual, astronomia) {
  const agora = paraMinutos((atual.localObsDateTime || "").split(" ").slice(1).join(" "));
  const nascer = paraMinutos(astronomia && astronomia.sunrise);
  const poente = paraMinutos(astronomia && astronomia.sunset);
  if (agora === null || nascer === null || poente === null) return true;
  return agora >= nascer && agora < poente;
}

// ============================================
// 3. LIGA O BOTÃO À FUNÇÃO
// ============================================
botaoBuscar.addEventListener("click", buscarClima);

// Permite também pesquisar pressionando Enter
campoCidade.addEventListener("keydown", function (evento) {
  if (evento.key === "Enter") {
    buscarClima();
  }
});

// ============================================
// 4. FUNÇÃO PRINCIPAL
// ============================================
function buscarClima() {
  const cidade = campoCidade.value.trim();

  // Validação: nunca enviar uma requisição vazia para a API
  if (cidade === "") {
    mostrarErro("Digite o nome de uma cidade.");
    campoCidade.focus();
    return;
  }

  mostrarCarregando();

  // Uma única requisição: a cidade vai direto na URL
  const url =
    `${CLIMA_URL}/${encodeURIComponent(cidade)}?format=j1&lang=pt`;

  fetch(url)
    .then(resposta => {
      // Para cidade inexistente a wttr.in responde com erro HTTP e um
      // texto simples (não JSON).
      if (resposta.status === 404) {
        const erro = new Error("Cidade não encontrada.");
        erro.tipo = "cidade";
        throw erro;
      }
      if (!resposta.ok) {
        throw new Error("Falha na consulta do clima.");
      }
      return resposta.text();
    })
    .then(texto => {
      let dados;
      try {
        dados = JSON.parse(texto);
      } catch (e) {
        const erro = new Error("Cidade não encontrada.");
        erro.tipo = "cidade";
        throw erro;
      }

      const atual = dados.current_condition && dados.current_condition[0];
      const area = dados.nearest_area && dados.nearest_area[0];
      if (!atual || !area) {
        const erro = new Error("Cidade não encontrada.");
        erro.tipo = "cidade";
        throw erro;
      }

      const astronomia = dados.weather && dados.weather[0] &&
        dados.weather[0].astronomy && dados.weather[0].astronomy[0];

      const local = {
        name: valor(area.areaName) || cidade,
        admin1: valor(area.region),
        country: valor(area.country)
      };

      mostrarResultado(local, atual, astronomia);
      salvarNoHistorico(local.name);
    })
    .catch(erro => {
      console.error(erro);
      // Mensagens diferentes: cidade inexistente não é o mesmo problema
      // que falta de internet.
      if (erro.tipo === "cidade") {
        mostrarErro(
          `Não encontramos a cidade "${cidade}". ` +
          `Confira a escrita e tente novamente.`
        );
      } else {
        mostrarErro(
          "Não foi possível consultar o clima agora. " +
          "Verifique sua conexão e tente novamente."
        );
      }
    })
    .finally(() => {
      botaoBuscar.disabled = false;
      botaoBuscar.textContent = "Buscar clima";
    });
}

// A wttr.in guarda textos assim: [{ "value": "Rio do Sul" }]
function valor(lista) {
  return lista && lista[0] ? lista[0].value : "";
}

// ============================================
// 5. FUNÇÕES DE EXIBIÇÃO
// ============================================

// Estado de carregamento: o botão fica desabilitado para evitar
// cliques repetidos enquanto a requisição está em andamento.
function mostrarCarregando() {
  botaoBuscar.disabled = true;
  botaoBuscar.textContent = "Consultando...";
  resultado.replaceChildren();
  const aviso = document.createElement("p");
  aviso.textContent = "Consultando o clima...";
  resultado.append(aviso);
}

function mostrarErro(texto) {
  resultado.replaceChildren();
  const aviso = document.createElement("p");
  aviso.className = "mensagem-erro";
  aviso.textContent = texto;
  resultado.append(aviso);
}

// ============================================
// MELHORIA 4 — ilustrações em SVG e fundo que muda com o tempo
// Cada weatherCode vira uma categoria; a categoria define o desenho
// (SVG feito no código, sem imagens externas) e as cores do fundo.
// Dia ou noite é calculado com o nascer e o pôr do sol da API.
// ============================================
const NUVEM = '<path class="nuvem" d="M22 50a13 13 0 0 1-1-26 18 18 0 0 1 35-2 14 14 0 0 1 2 28z"/>';
const SOL = '<g class="sol"><circle cx="40" cy="30" r="13"/>' +
  '<path d="M58 30h6M52.7 42.7l4.3 4.3M40 48v6M27.3 42.7L23 47M22 30h-6M27.3 17.3L23 13M40 12V6M52.7 17.3L57 13"/></g>';
const LUA = '<path class="lua" d="M48 10a22 22 0 1 0 18 34 17 17 0 0 1-18-34z"/>';

function desenharIcone(tipo, dia) {
  const astro = dia ? SOL : LUA;
  const nuvemAlta = '<g transform="translate(0 -4)">' + NUVEM + '</g>';
  let corpo;
  if (tipo === "limpo") {
    corpo = astro;
  } else if (tipo === "parcial") {
    corpo = '<g transform="translate(-10 -8) scale(.8)">' + astro + '</g>' +
            '<g transform="translate(8 8)">' + NUVEM + '</g>';
  } else if (tipo === "nublado") {
    corpo = '<g class="nuvem cinza" transform="translate(24 0) scale(.75)">' + NUVEM + '</g>' +
            '<g transform="translate(-2 8)">' + NUVEM + '</g>';
  } else if (tipo === "nevoeiro") {
    corpo = nuvemAlta + '<path class="traco-nevoa" d="M16 56h46M24 63h34"/>';
  } else if (tipo === "neve") {
    corpo = nuvemAlta + '<circle class="floco" cx="28" cy="57" r="2.5"/>' +
            '<circle class="floco" cx="42" cy="63" r="2.5"/><circle class="floco" cx="56" cy="57" r="2.5"/>';
  } else if (tipo === "trovoada") {
    corpo = '<g class="nuvem escura" transform="translate(0 -6)">' + NUVEM + '</g>' +
            '<polygon class="raio" points="42,42 33,57 41,57 37,68 52,49 44,49 48,42"/>';
  } else {
    corpo = nuvemAlta + '<path class="traco-chuva" d="M28 54l-3 9M42 54l-3 9M56 54l-3 9"/>';
  }
  return '<svg viewBox="0 0 80 70" xmlns="http://www.w3.org/2000/svg">' + corpo + '</svg>';
}

function mostrarResultado(local, atual, astronomia) {
  const tempo = descreverTempo(atual);
  const tipo = categoria(atual.weatherCode);
  const dia = eDia(atual, astronomia);

  // O fundo da página muda pelos atributos data-* (ver style.css)
  document.body.dataset.tempo = tipo;
  document.body.dataset.dia = dia ? "dia" : "noite";

  resultado.replaceChildren();

  const card = document.createElement("div");
  card.className = "card-clima";

  const topo = document.createElement("div");
  topo.className = "topo";

  const ilustracao = document.createElement("div");
  ilustracao.className = "ilustracao";
  ilustracao.setAttribute("aria-hidden", "true");
  // innerHTML só com o SVG fixo acima; nenhum texto digitado entra aqui
  ilustracao.innerHTML = desenharIcone(tipo, dia);

  const bloco = document.createElement("div");
  bloco.className = "temp-bloco";
  const temperatura = document.createElement("p");
  temperatura.className = "temperatura";
  temperatura.textContent = `${Math.round(Number(atual.temp_C))}°C`;
  const condicao = document.createElement("p");
  condicao.className = "condicao";
  condicao.textContent = tempo;
  bloco.append(temperatura, condicao);
  topo.append(ilustracao, bloco);

  const corpo = document.createElement("div");
  corpo.className = "corpo";

  // Nome vindo da API, não o texto digitado
  const titulo = document.createElement("h2");
  titulo.textContent = local.name;

  // MELHORIA 2 — confirma qual local a API encontrou.
  const ondeFica = document.createElement("p");
  ondeFica.className = "local";
  ondeFica.textContent = [local.admin1, local.country].filter(Boolean).join(" — ");

  const grade = document.createElement("div");
  grade.className = "grade";
  grade.append(
    linhaDado("Sensação", `${Math.round(Number(atual.FeelsLikeC))}°C`),
    linhaDado("Umidade", `${atual.humidity}%`),
    linhaDado("Vento", `${atual.windspeedKmph} km/h`)
  );

  const atualizado = document.createElement("p");
  atualizado.className = "atualizado";
  atualizado.textContent = `Medição de ${formatarHora(atual.localObsDateTime)}`;

  corpo.append(titulo, ondeFica, grade, atualizado);
  card.append(topo, corpo);
  resultado.append(card);
}

function linhaDado(rotulo, valor) {
  const caixa = document.createElement("div");
  caixa.className = "dado";
  const r = document.createElement("span");
  r.className = "rotulo";
  r.textContent = rotulo;
  const v = document.createElement("span");
  v.className = "valor";
  v.textContent = valor;
  caixa.append(r, v);
  return caixa;
}

// A API devolve a hora no formato 2026-11-10 06:15 PM
function formatarHora(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/.exec(texto || "");
  const minutos = m ? paraMinutos(m[4]) : null;
  if (!m || minutos === null) {
    return "horário não informado";
  }
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return `${m[3]}/${m[2]}/${m[1]} às ${hh}:${mm}`;
}

// ============================================
// MELHORIA 3 — histórico das últimas buscas
// As cidades ficam salvas no navegador (localStorage), então a lista
// continua lá quando a página é recarregada.
// ============================================
const CHAVE_HISTORICO = "clima:ultimasCidades";

function lerHistorico() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || [];
  } catch (erro) {
    // Se o conteúdo salvo estiver corrompido, começa do zero.
    return [];
  }
}

function salvarNoHistorico(cidade) {
  const lista = lerHistorico()
    .filter(item => item.toLowerCase() !== cidade.toLowerCase());

  lista.unshift(cidade);

  try {
    localStorage.setItem(
      CHAVE_HISTORICO,
      JSON.stringify(lista.slice(0, 5))
    );
  } catch (erro) {
    console.error("Não foi possível salvar o histórico.", erro);
  }

  mostrarHistorico();
}

function mostrarHistorico() {
  const lista = lerHistorico();

  listaHistorico.replaceChildren();
  historico.hidden = lista.length === 0;

  lista.forEach(cidade => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao-historico";
    botao.textContent = cidade;
    botao.addEventListener("click", () => {
      campoCidade.value = cidade;
      buscarClima();
    });
    listaHistorico.append(botao);
  });
}

mostrarHistorico();

// ============================================
// MELHORIA 7 — aplicativo instalável (PWA)
// Registra o service worker (sw.js). Só funciona em https:// ou
// localhost; abrindo o arquivo direto (file://) o registro é ignorado
// e o app continua funcionando normalmente.
// ============================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.warn("Service worker não registrado:", erro.message);
    });
  });
}
