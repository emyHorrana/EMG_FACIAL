
let dom = {};
const config = {
    DATA_FETCH_INTERVAL_MS: 10, 
    MAX_DATA_POINTS: 300, 
    TOAST_DURATION_MS: 3000,
    MAX_ADC_VALUE: 4095, 
    
    // --- Configurações de Escala do Gráfico ---
    VISUAL_Y_MAX: 4200, 
    
    VISUAL_X_MAX_S: 3,  
};

const state = {
    isMonitoring: false,
    startTime: null,
    realTimeData: [], // Buffer para o gráfico (contém 'raw' e 'filtered')
    dataForSaving: [], 
    savedFiles: [],
    statistics: { currentADC: 0, totalSamples: 0 }, 
    intervals: {} 
};

// -------------------- INICIALIZAÇÃO E LISTENERS --------------------

addEventListener('DOMContentLoaded', () => {
    // Mapeamento DOM (Mantido)
    dom = {
        startBtn: document.getElementById('startBtn'),
        stopBtn: document.getElementById('stopBtn'),
        clearBtn: document.getElementById('clearBtn'),
        toast: document.getElementById('toast'),
        fileHistoryBody: document.getElementById('fileHistoryBody'),
        dataTableBody: document.getElementById('dataTableBody'),
        currentAmplitude: document.getElementById('currentAmplitude'), 
        avgFrequency: document.getElementById('avgFrequency'),
        recordingTime: document.getElementById('recordingTime'),
        signalChart: document.getElementById('signalChart'), 
        saveModal: document.getElementById('saveModal'),
        btnNo: document.getElementById('btnNo'),
        btnYes: document.getElementById('btnYes'),
        btnSave: document.getElementById('btnSave'),
        fileName: document.getElementById('fileName'),
        inputGroup: document.getElementById('inputGroup'),
        modalBody: document.getElementById('modalBody'),
        connectionStatus: document.getElementById('connectionStatus'),
        clock: document.getElementById('clock'),
    };

    dom.startBtn.addEventListener('click', iniciarMonitoramento);
    dom.stopBtn.addEventListener('click', pararESalvar);
    dom.clearBtn.addEventListener('click', limparDados);
    dom.btnNo.addEventListener('click', fecharModal);
    dom.btnYes.addEventListener('click', mostrarInputNome);
    dom.btnSave.addEventListener('click', salvarArquivo);
    dom.saveModal.addEventListener('click', (e) => {
        if (e.target === dom.saveModal) fecharModal();
    });

    redimensionarCanvas();
    window.addEventListener('resize', () => {
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(redimensionarCanvas, 200);
    });
    // Define a janela máxima de pontos com base no tempo e na frequência de Polling
    config.MAX_DATA_POINTS = (config.VISUAL_X_MAX_S * 1000) / config.DATA_FETCH_INTERVAL_MS;
    
    requestAnimationFrame(animarGrafico); 
    renderizarHistorico(); 
});

// -------------------- FUNÇÕES DE POLLING E PROCESSAMENTO --------------------

function buscarDadosRealTime() {
    if (!state.isMonitoring) return; 

    // Rota corrigida: /live_data
    fetch('/live_data') 
        .then(res => {
            if (!res.ok) throw new Error('Network response not ok');
            return res.json(); 
        })
        .then(data => {
            if (data && data.time_ms !== undefined) {
                 processarAmostraRealTime(data); 
            }
        })
        .catch(err => {})
        .finally(() => {
            setTimeout(buscarDadosRealTime, config.DATA_FETCH_INTERVAL_MS);
        });
}

function processarAmostraRealTime(data) {
    if (!state.isMonitoring || data.time_ms === undefined) return; 
    
    const amplitudeFiltrada = data.filtered || 0; 
    const amplitudeBruta = data.raw || 0;
    const timestamp = data.time_ms;

    const newPoint = { 
        timestamp: timestamp, 
        filtered: amplitudeFiltrada, 
        raw: amplitudeBruta,
        dateObj: new Date(state.startTime + timestamp) 
    };

    state.realTimeData.push(newPoint); 
    state.dataForSaving.push(newPoint); // Salva o ponto inteiro

    // Atualiza estatísticas e UI com base no sinal filtrado
    state.statistics.currentADC = amplitudeFiltrada;
    
    if (state.realTimeData.length > config.MAX_DATA_POINTS) {
        state.realTimeData.shift(); 
    }
    
    // ... (restante da atualização da UI)
    const highlightClass = amplitudeFiltrada > 3000 || amplitudeFiltrada < 1000 ? 'highlight-pulse' : '';
    dom.currentAmplitude.innerHTML = `<span class="${highlightClass}">${amplitudeFiltrada}</span> <span class="unit">ADC</span>`; 
    dom.avgFrequency.innerHTML = `${(1000 / config.DATA_FETCH_INTERVAL_MS).toFixed(0)} <span class="unit">Hz</span>`; 
    
    // ... (restante da atualização da tabela)
    const ultimos = state.realTimeData.slice(-4).reverse();
    dom.dataTableBody.innerHTML = ultimos.map(d => {
        const timeStr = d.dateObj.toLocaleTimeString('pt-BR', { second: '2-digit', minute: '2-digit' }) + ':' + String(d.dateObj.getMilliseconds()).padStart(3, '0');
        const ampHighlight = d.filtered > 3000 ? 'log-highlight' : ''; 
        
        return `
            <div class="log-entry">
                <span class="log-time">${timeStr}</span>
                <span class="log-amplitude ${ampHighlight}">${d.filtered} ADC</span>
            </div>
        `;
    }).join('');
}

// -------------------- RENDERIZAÇÃO DO GRÁFICO (OSCILOSCÓPIO) --------------------

function redimensionarCanvas() {
    const container = dom.signalChart.parentElement;
    dom.signalChart.width = container.clientWidth;
    const headerOffset = 50; 
    dom.signalChart.height = container.clientHeight - headerOffset; 
    
    if (dom.signalChart.height <= 50) {
        dom.signalChart.height = 350; 
    }
}

function desenharSinal(ctx, data, property, color, isFiltered = false) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    const VISUAL_Y_MAX = config.VISUAL_Y_MAX;
    const scaleY = h / VISUAL_Y_MAX; 
    const stepX = w / (config.MAX_DATA_POINTS - 1); 

    ctx.beginPath();
    ctx.strokeStyle = color; 
    ctx.lineWidth = isFiltered ? 3 : 1; // Filtro mais espesso
    ctx.shadowBlur = isFiltered ? 10 : 0; 
    ctx.shadowColor = color;

    data.forEach((pt, i) => {
        const x = i * stepX;
        
        let y_mapped = pt[property] * scaleY;
        
        if (y_mapped > h) {
            y_mapped = h;
        }
        
        
        const y = h - y_mapped;

        if (i === 0) {
            ctx.moveTo(x, y); 
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    ctx.shadowBlur = 0; 
}

function desenharEixos(ctx, w, h) {
    const divisiones = 5;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; 
    ctx.font = '10px Quicksand';
    
    // --- EIXO Y (AMPLITUDE) ---
    ctx.textAlign = 'right';
    const VISUAL_Y_MAX = config.VISUAL_Y_MAX;
    
    for (let i = 0; i <= divisiones; i++) {
        const y_pos = (h / divisiones) * i;
        
        // Linha de grade horizontal
        ctx.beginPath();
        ctx.moveTo(0, y_pos);
        ctx.lineTo(w, y_pos);
        ctx.stroke();

        // Rótulo ADC
        const adc_value = Math.round(VISUAL_Y_MAX - (VISUAL_Y_MAX / divisiones) * i);
        if (i < divisiones) { 
            ctx.fillText(`${adc_value}`, w - 5, y_pos + 10); 
        }
    }
    
    // --- EIXO X (TEMPO DINÂMICO) ---
    ctx.textAlign = 'center';
    
    // Pegamos o último dado (mais recente) para calcular o tempo atual
    const data = state.realTimeData;
    const temDados = data.length > 0;
    
    // Se não tiver dados, usa hora atual. Se tiver, usa a do último pacote.
    const now = temDados ? data[data.length - 1].dateObj : new Date();
    const timeWindowMS = config.VISUAL_X_MAX_S * 1000; // 3000ms
    
    for (let i = 0; i <= divisiones; i++) {
        const x_pos = (w / divisiones) * i;
        
        // Linha de grade vertical
        ctx.beginPath();
        ctx.moveTo(x_pos, 0);
        ctx.lineTo(x_pos, h);
        ctx.stroke();


        const timeOffset = timeWindowMS * (1 - (i / divisiones));
        const gridTime = new Date(now.getTime() - timeOffset);
        
        // Formata para mostrar apenas Segundos:Milissegundos (ex: 15:42)
        const timeStr = gridTime.toLocaleTimeString('pt-BR', { second: '2-digit' }) + 
                        ':' + String(gridTime.getMilliseconds()).padStart(3, '0').slice(0, 2);

        ctx.fillText(timeStr, x_pos, h + 15);
    }
    
    // Título do Eixo
    ctx.fillText("Tempo (s:ms)", w / 2, h + 30);
}


function animarGrafico() {
    const ctx = dom.signalChart.getContext('2d');
    const w = dom.signalChart.width;
   
    const h = dom.signalChart.height - 40; 
    
    // Limpa TUDO (incluindo a margem inferior onde ficam os números)
    ctx.clearRect(0, 0, w, dom.signalChart.height); 
    
    const data = state.realTimeData;
    
    // 1. Desenha Eixos e Grades 
    desenharEixos(ctx, w, h);
    
    if (data.length < 2) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.font = '20px Quicksand';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando Fluxo de Dados...', w / 2, h / 2);
        requestAnimationFrame(animarGrafico); 
        return;
    }

    // 2. Plota o Sinal Bruto (Linha Fina, cor diferente)
    desenharSinal(ctx, data, 'raw', 'skyblue', false);

    // 3. Plota o Sinal Filtrado (Linha Grossa, cor primária)
    desenharSinal(ctx, data, 'filtered', '#FFD700', true);

    requestAnimationFrame(animarGrafico); 
}

// -------------------- OUTRAS FUNÇÕES AUXILIARES (Mantidas) --------------------

function iniciarMonitoramento() {
    if (state.isMonitoring) return;
    state.isMonitoring = true;
    state.startTime = Date.now();
    state.realTimeData = [];
    state.dataForSaving = []; 
    state.statistics = { currentADC: 0, totalSamples: 0 };
    atualizarUI(true);
    mostrarToast('✨ CAPTURANDO SINAL EMG...');
    fetch('/start').catch(e => console.error("Falha ao enviar /start:", e)); 
    setTimeout(() => {
        buscarDadosRealTime(); 
        state.intervals.timer = setInterval(atualizarCronometro, 1000);
    }, 100); 
}

function pararESalvar() {
    if (!state.isMonitoring) return;
    state.isMonitoring = false; 
    clearInterval(state.intervals.timer);
    fetch('/stop').catch(e => console.error("Falha ao enviar /stop:", e));
    atualizarUI(false);
    setTimeout(() => {
        if (state.dataForSaving.length === 0) {
            mostrarToast('Nenhum dado capturado para salvar.');
            return;
        }
        abrirModal();
    }, 100);
}

function gerarEExportarCSV(nomeUsuario) {
    const fileName = `${nomeUsuario.replace(/[^a-z0-9]/gi, '_')}_EMG.csv`;
    // Inclui ambas as leituras no CSV
    const header = 'Timestamp(ms),DataHoraISO,AmplitudeFiltrada(ADC),AmplitudeBruta(ADC)\n'; 
    
    const rows = state.dataForSaving.map(d => 
        `${d.timestamp},${d.dateObj.toISOString()},${d.filtered},${d.raw}`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    state.savedFiles.unshift({ nome: fileName, hora: new Date().toLocaleTimeString('pt-BR'), urlBlob: url, dados: state.dataForSaving.slice() });
    renderizarHistorico();
    mostrarToast(`ARQUIVO SALVO: ${fileName}`);
}

function atualizarCronometro() {
    if (!state.startTime) return;
    const diff = Math.floor((Date.now() - state.startTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2,'0');
    const s = (diff % 60).toString().padStart(2,'0');
    dom.recordingTime.textContent = `${m}:${s}`; 
}

function abrirModal() {
    dom.saveModal.classList.add('show');
    dom.inputGroup.classList.add('hidden');
    dom.modalBody.querySelector('.modal-question').style.display = 'block';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'flex';
    dom.fileName.value = `Sessao_${new Date().getHours()}h${new Date().getMinutes()}`;
}

function fecharModal() {
    dom.saveModal.classList.remove('show');
}

function mostrarInputNome() {
    dom.modalBody.querySelector('.modal-question').style.display = 'none';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'none';
    dom.inputGroup.classList.remove('hidden');
    dom.fileName.focus();
}

function salvarArquivo() {
    const nomeArquivo = dom.fileName.value.trim();
    if (!nomeArquivo) {
        mostrarToast('⚠️ Digite um nome para o arquivo!');
        return;
    }
    gerarEExportarCSV(nomeArquivo);
    fecharModal();
}

function renderizarHistorico() {
    const tbody = dom.fileHistoryBody;
    if (state.savedFiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty">Vamos capturar alguns sorrisos?</td></tr>';
        return;
    }
    tbody.innerHTML = state.savedFiles.map((f, index) => `
        <tr>
            <td>${f.nome}</td>
            <td class="text-secondary">${f.hora}</td>
            <td><button onclick="baixarArquivo(${index})" class="download-link">BAIXAR</button></td>
        </tr>
    `).join('');
}

function baixarArquivo(index) {
    const arquivo = state.savedFiles[index];
    if (!arquivo) return;
    
    const link = document.createElement('a');
    link.href = arquivo.urlBlob;
    link.download = arquivo.nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    mostrarToast(`📥 Download: ${arquivo.nome}`);
}

function limparDados() {
    if (state.isMonitoring) {
        mostrarToast('⚠️ Pare a captura antes de limpar os dados!');
        return;
    }
    state.realTimeData = [];
    state.dataForSaving = []; 
    state.savedFiles = [];
    dom.dataTableBody.innerHTML = '';
    renderizarHistorico();
    mostrarToast('Dados e histórico de arquivos limpos.');
}

function atualizarUI(isRecording) {
    if (isRecording) {
        dom.startBtn.classList.add('hidden');
        dom.stopBtn.classList.remove('hidden');
        dom.connectionStatus.classList.add('active'); 
    } else {
        dom.startBtn.classList.remove('hidden');
        dom.stopBtn.classList.add('hidden');
        dom.connectionStatus.classList.remove('active');
    }
}

function mostrarToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(() => dom.toast.classList.remove('show'), config.TOAST_DURATION_MS);
}