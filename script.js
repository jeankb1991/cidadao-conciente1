// =========================
//  ESTADO DA APLICAÇÃO
// =========================
let state = {
  categoria: '',
  lat: null,
  lng: null,
  fotoBase64: null,
  historico: []
};

// Configuração de categorias
const catIcons = {
  poste: { icon: '🔦', label: 'Poste Apagado' },
  buraco: { icon: '🕳️', label: 'Buraco na Via' },
  dengue: { icon: '🦟', label: 'Foco de Dengue' },
  mato: { icon: '🌿', label: 'Falta de Roço' },
  outro: { icon: '⚠️', label: 'Outro Problema' }
};

// =========================
//  INICIALIZAÇÃO
// =========================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  
  // Setup Categorias
  setupCategories();
  
  // Carregar histórico
  carregarHistorico();
  atualizarDashboard();
  renderizarHistorico();
  
  // Iniciar recursos
  iniciarCamera(true);
  initMapa();
});

// =========================
//  CATEGORIAS
// =========================
function setupCategories() {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      // Remove active de todos
      cards.forEach(c => c.classList.remove('active'));
      // Adiciona no clicado
      card.classList.add('active');
      // Salva no state
      state.categoria = card.dataset.category;
      document.getElementById('selectedCategory').value = state.categoria;
    });
  });
}

// =========================
//  CÂMERA
// =========================
const video = document.getElementById('camera');
const canvas = document.getElementById('foto');
let currentStream = null;
let usarTraseira = true;

async function iniciarCamera(preferirTraseira = true) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  const constraints = {
    audio: false,
    video: isMobile 
      ? { facingMode: { ideal: preferirTraseira ? "environment" : "user" } }
      : true
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    currentStream = stream;
    
    // Tenta ser mais específico no mobile se for traseira
    if (isMobile && preferirTraseira) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === "videoinput");
      const traseira = videoInputs.find(d => /back|traseir|rear|environment/i.test(d.label));
      
      if (traseira && traseira.deviceId) {
        const stream2 = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: traseira.deviceId } }
        });
        currentStream.getTracks().forEach(t => t.stop());
        video.srcObject = stream2;
        currentStream = stream2;
      }
    }
  } catch (err) {
    console.warn("Tentando fallback da câmera", err);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      currentStream = stream;
    } catch (e) {
      alert("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }
}

function alternarCamera() {
  usarTraseira = !usarTraseira;
  iniciarCamera(usarTraseira);
}

function tirarFoto() {
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  
  if(canvas.width === 0) return; // Video not ready
  
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.fotoBase64 = canvas.toDataURL("image/jpeg", 0.8);
  
  // UI update
  video.style.display = "none";
  canvas.style.display = "block";
  document.getElementById('btnCapturar').classList.add('hidden');
  document.getElementById('btnTrocarCam').classList.add('hidden');
  document.getElementById('btnLimparFoto').classList.remove('hidden');
}

function limparFoto() {
  state.fotoBase64 = null;
  video.style.display = "block";
  canvas.style.display = "none";
  document.getElementById('btnCapturar').classList.remove('hidden');
  document.getElementById('btnTrocarCam').classList.remove('hidden');
  document.getElementById('btnLimparFoto').classList.add('hidden');
}

// =========================
//  MAPA (Leaflet)
// =========================
let map, marker;

function obterGPS() {
  document.getElementById('coordsDisplay').textContent = "Buscando localização exata...";
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        atualizarLocalizacao(lat, lng, true);
      },
      err => {
        console.warn("Erro geolocalização", err);
        document.getElementById('coordsDisplay').textContent = "Não foi possível obter GPS exato. Verifique as permissões.";
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } else {
    document.getElementById('coordsDisplay').textContent = "Geolocalização não suportada no seu navegador.";
  }
}

function initMapa() {
  // Layer do OpenStreetMap (Ruas Padrão)
  const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  });

  // Layer de Satélite (Esri World Imagery) - Imagens reais e coloridas
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  // Layer de Relevo (OpenTopoMap)
  const relevo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
  });

  // Inicializa o mapa centralizado no Brasil, com satélite por padrão
  map = L.map('map', {
    center: [-14.235, -51.925],
    zoom: 4,
    layers: [satelite]
  });

  const baseMaps = {
    "Satélite (Realista)": satelite,
    "Ruas (Padrão)": ruas,
    "Relevo (Topografia)": relevo
  };

  L.control.layers(baseMaps).addTo(map);

  // Tenta obter geolocalização do usuário exata
  obterGPS();
}

function atualizarLocalizacao(lat, lng, centralizar = false) {
  state.lat = lat;
  state.lng = lng;

  if (centralizar) {
    map.setView([lat, lng], 18); // Zoom máximo para exibir o local exato
  }

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng], { draggable: false }).addTo(map);
  }

  document.getElementById('coordsDisplay').textContent = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
}

// =========================
//  DADOS E HISTÓRICO
// =========================
function salvarHistorico() {
  localStorage.setItem('cidadaoConscienteData', JSON.stringify(state.historico));
  atualizarDashboard();
  renderizarHistorico();
}

function carregarHistorico() {
  const data = localStorage.getItem('cidadaoConscienteData');
  if (data) {
    try {
      state.historico = JSON.parse(data);
    } catch (e) {
      state.historico = [];
    }
  }
}

function atualizarDashboard() {
  const contagens = { poste: 0, buraco: 0, dengue: 0, mato: 0, outro: 0 };
  
  state.historico.forEach(item => {
    if(contagens[item.categoria] !== undefined) {
      contagens[item.categoria]++;
    } else {
      contagens.outro++;
    }
  });

  document.getElementById('count-poste').textContent = contagens.poste;
  document.getElementById('count-buraco').textContent = contagens.buraco;
  document.getElementById('count-dengue').textContent = contagens.dengue;
  document.getElementById('count-mato').textContent = contagens.mato;
}

function renderizarHistorico() {
  const lista = document.getElementById('listaDenuncias');
  const vazio = document.getElementById('historicoVazio');
  const filtro = document.getElementById('filtroHistorico').value;
  
  lista.innerHTML = '';
  
  let filtrados = state.historico;
  if (filtro !== 'todas') {
    filtrados = state.historico.filter(i => i.categoria === filtro);
  }

  if (filtrados.length === 0) {
    vazio.style.display = 'block';
  } else {
    vazio.style.display = 'none';
    
    // Sort desc (mais novos primeiro)
    filtrados.sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
      const date = new Date(item.timestamp).toLocaleString('pt-BR');
      const catInfo = catIcons[item.categoria] || catIcons.outro;
      const mapLink = `https://maps.google.com/?q=${item.lat},${item.lng}`;
      
      const li = document.createElement('li');
      li.className = 'denuncia-card';
      
      li.innerHTML = `
        ${item.foto ? `<img src="${item.foto}" alt="Foto da denúncia" loading="lazy">` : ''}
        <div class="denuncia-content">
          <div class="denuncia-header">
            <span class="denuncia-badge ${item.categoria}">
              ${catInfo.icon} ${catInfo.label}
            </span>
            <span class="denuncia-prio ${item.prioridade}">${item.prioridade}</span>
          </div>
          
          <p class="denuncia-desc">${item.descricao || "Sem descrição adicional."}</p>
          
          <div class="denuncia-meta">
            <span>📍 ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)} — <a href="${mapLink}" target="_blank">Abrir Mapa</a></span>
            <span>🕒 ${date}</span>
            <button class="btn-delete-hist" onclick="apagarDenuncia(${item.id})">Apagar Registro</button>
          </div>
        </div>
      `;
      lista.appendChild(li);
    });
  }
}

function apagarDenuncia(id) {
  if(confirm("Deseja realmente apagar este registro do seu histórico local?")) {
    state.historico = state.historico.filter(i => i.id !== id);
    salvarHistorico();
  }
}

// =========================
//  AÇÕES DE FORMULÁRIO
// =========================
function registrarDenuncia() {
  if (!state.categoria) {
    alert("Por favor, selecione qual é o problema (passo 1).");
    return;
  }
  
  if (!state.lat || !state.lng) {
    alert("Por favor, aguarde a localização exata do GPS para continuar.");
    return;
  }
  
  if (!state.fotoBase64) {
    if(!confirm("Você não capturou uma foto. Deseja registrar mesmo assim?")) {
      return;
    }
  }

  const descricao = document.getElementById("descricao").value.trim();
  const prioridade = document.querySelector('input[name="prioridade"]:checked').value;
  
  const novaDenuncia = {
    id: Date.now(),
    timestamp: Date.now(),
    categoria: state.categoria,
    lat: state.lat,
    lng: state.lng,
    foto: state.fotoBase64,
    descricao: descricao,
    prioridade: prioridade
  };

  state.historico.push(novaDenuncia);
  salvarHistorico();
  
  // Limpar form
  limparFormulario();
  alert("Denúncia salva no histórico com sucesso!");
  
  // Scroll para histórico
  document.querySelector('.historico').scrollIntoView({ behavior: 'smooth' });
}

function limparFormulario() {
  document.getElementById("denunciaForm").reset();
  limparFoto();
  // Resetar categoria visualmente
  document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
  state.categoria = '';
  document.getElementById('selectedCategory').value = '';
}

function enviarWhatsApp() {
  if (!state.categoria || !state.lat) {
    alert("Selecione a categoria e aguarde a localização antes de enviar.");
    return;
  }

  let numero = document.getElementById("whats").value.replace(/[^\d+]/g, "");
  if (!numero) {
    // Numero fallback generico se o usuario nao preencheu, porem para wa.me é bom ter.
    // Se nao tiver, abre a seleção de contatos.
    numero = ""; 
  }

  const catInfo = catIcons[state.categoria] || catIcons.outro;
  const descricao = document.getElementById("descricao").value.trim();
  const prioridade = document.querySelector('input[name="prioridade"]:checked').value;
  const mapLink = `https://maps.google.com/?q=${state.lat},${state.lng}`;
  const data = new Date().toLocaleString('pt-BR');

  const texto = 
`🚨 *Denúncia Cidadão Consciente*
*Problema:* ${catInfo.icon} ${catInfo.label}
*Prioridade:* ${prioridade}

*Descrição:* ${descricao || "Nenhuma"}

📍 *Localização:*
${mapLink}

🕒 ${data}

_(Foto anexada manualmente, se aplicável)_`;

  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}
