// =========================
//  CONTROLE DE CÂMERA
// =========================
const video = document.getElementById('camera');
let currentStream = null;
let usarTraseira = true;

async function iniciarCamera(preferirTraseira = true) {
  // encerra stream anterior
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");

    let deviceId = null;
    if (preferirTraseira) {
      const back = videoDevices.find(d => /back|rear|environment|traseir/i.test(d.label));
      if (back) deviceId = back.deviceId;
    } else {
      const front = videoDevices.find(d => /front|user|frontal/i.test(d.label));
      if (front) deviceId = front.deviceId;
    }

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: preferirTraseira ? "environment" : "user" },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentStream = stream;

    document.getElementById("tipoCamera").textContent =
      preferirTraseira ? "📷 Câmera: Traseira" : "🤳 Câmera: Frontal";
  } catch (err) {
    console.error("Erro ao iniciar câmera:", err);
    alert("Erro ao acessar a câmera. Verifique permissões ou recarregue a página.");
  }
}

function alternarCamera() {
  usarTraseira = !usarTraseira;
  iniciarCamera(usarTraseira);
}

if (location.protocol === "https:" || location.hostname === "localhost") {
  iniciarCamera(true);
} else {
  alert("⚠️ Acesso à câmera requer HTTPS ou localhost.");
}

// =========================
//  CAPTURAR FOTO
// =========================
function tirarFoto() {
  const canvas = document.getElementById('foto');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.style.display = "block";
}

// =========================
//  GEOLOCALIZAÇÃO + MAPA
// =========================
let LAT = null, LON = null;

function initMap(lat, lon) {
  LAT = lat; LON = lon;
  const map = document.getElementById("map");
  map.innerHTML = `<iframe 
    width="100%" height="100%" frameborder="0" style="border:0"
    src="https://www.google.com/maps?q=${lat},${lon}&z=17&output=embed"
    allowfullscreen>
  </iframe>`;
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => initMap(pos.coords.latitude, pos.coords.longitude),
    err => alert("Erro ao obter localização: " + err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
} else {
  alert("Geolocalização não suportada.");
}

// =========================
//  REGISTRAR DENÚNCIA
// =========================
function registrarDenuncia() {
  const canvas = document.getElementById("foto");
  const descricao = document.getElementById("descricao").value.trim();
  const lista = document.getElementById("listaDenuncias");

  if (canvas.style.display === "none") {
    alert("Por favor, tire uma foto antes de registrar.");
    return;
  }

  const imagem = canvas.toDataURL("image/png");
  const agora = new Date().toLocaleString();
  const coordsTxt = (LAT && LON) ? `${LAT.toFixed(6)}, ${LON.toFixed(6)}` : "Não disponível";
  const linkMaps = (LAT && LON) ? `https://maps.google.com/?q=${LAT},${LON}&z=17` : "#";

  const item = document.createElement("li");
  item.innerHTML = `
    <img src="${imagem}" width="160" alt="Foto registrada"><br>
    <strong>Descrição:</strong> ${descricao || "Não informada"}<br>
    <strong>Localização:</strong> ${coordsTxt} 
    ${LAT ? `— <a href="${linkMaps}" target="_blank">Abrir no mapa</a>` : ""}<br>
    <strong>Data/Hora:</strong> ${agora}
  `;
  lista.appendChild(item);
  document.getElementById("denunciaForm").reset();
}

// =========================
//  ENVIAR PELO WHATSAPP
// =========================
function normalizarNumeroWhats(numero) {
  numero = (numero || "").trim();
  if (!numero) return "";
  if (numero.startsWith("+")) return "+" + numero.replace(/[^\d]/g, "");
  return numero.replace(/[^\d]/g, "");
}

function enviarWhatsApp() {
  const descricao = (document.getElementById("descricao").value || "").trim();
  const numero = normalizarNumeroWhats(document.getElementById("whats").value);

  if (!numero) {
    alert("Informe um número de WhatsApp válido (ex.: +5585999999999).");
    return;
  }

  const dataHora = new Date().toLocaleString();
  const coordsTxt = (LAT && LON) ? `${LAT.toFixed(6)}, ${LON.toFixed(6)}` : "Não disponível";
  const linkMaps = (LAT && LON) ? `https://maps.google.com/?q=${LAT},${LON}&z=17` : "";

  const mensagem =
`Denúncia — Cidadão Consciente
Descrição: ${descricao || "Não informada"}
Localização: ${coordsTxt}
Mapa: ${linkMaps || "N/A"}
Data/Hora: ${dataHora}`;

  const url = `https://wa.me/${encodeURIComponent(numero)}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank");
}
