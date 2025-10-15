let dom = {};

const config = {
    PREPARATION_TIME_MS: 2000,
    COUNTDOWN_STEP_MS: 1000,
    EXPRESSION_DURATION_S: 5,
    PROGRESS_INTERVAL_MS: 100,
    DATA_FETCH_INTERVAL_MS: 1000,
    TOAST_DURATION_MS: 3000,
};

const state = {
    isCapturing: false,
    startTime: null,
    sequenceInProgress: false,
    activeTimers: []
};addEventListener('DOMContentLoaded', () => {
    dom = {
        startBtn: document.getElementById('startBtn'),
        exportBtn: document.getElementById('exportBtn'),
        clearBtn: document.getElementById('clearBtn'),
        modalStopBtn: document.getElementById('modalStopBtn'),
        status: document.getElementById('status'),
        captureModal: document.getElementById('captureModal'),
        stageEmoji: document.getElementById('stageEmoji'),
        stageText: document.getElementById('stageText'),
        countdown: document.getElementById('countdown'),
        progressContainer: document.getElementById('progressContainer'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        modalControls: document.getElementById('modalControls'),
        toast: document.getElementById('toast'),
        csvArea: document.getElementById('csvArea'),
        dataTableBody: document.getElementById('dataTableBody'),
        currentAmplitude: document.getElementById('currentAmplitude'),
        avgFrequency: document.getElementById('avgFrequency'),
        sampleCount: document.getElementById('sampleCount'),
        recordingTime: document.getElementById('recordingTime'),
    };

    dom.startBtn.addEventListener('click', iniciarSequencia);
    dom.exportBtn.addEventListener('click', baixar);
    dom.clearBtn.addEventListener('click', limparRegistro);
    dom.modalStopBtn.addEventListener('click', pararCaptura);

    setInterval(fetchData, config.DATA_FETCH_INTERVAL_MS);
});

// Funções utilitárias para timestamp
function formatarTimestamp(timestampValue) {
    let dataObj;
    
    if (!timestampValue || isNaN(parseInt(timestampValue))) {
        dataObj = new Date();
    } else {
        const timestamp = parseInt(timestampValue, 10);
        
        if (timestamp < 1000000000000) {
            dataObj = new Date(timestamp * 1000);
        } else {
            dataObj = new Date(timestamp);
        }
        
        if (isNaN(dataObj.getTime())) {
            dataObj = new Date();
        }
    }
    
    return dataObj.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function gerarTimestampArquivo() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function iniciarSequencia() {
    if (state.isCapturing || state.sequenceInProgress) return;
    state.sequenceInProgress = true;
    dom.startBtn.disabled = true;
    dom.captureModal.style.display = 'flex';
    sequenciaPreparacao();
}

function pararCaptura() {
    state.isCapturing = false;
    state.sequenceInProgress = false;
    clearAllTimers();
    dom.captureModal.style.display = 'none';
    dom.modalControls.style.display = 'none';
    dom.startBtn.disabled = false;
    dom.status.className = 'status stopped';
    dom.status.innerHTML = '<div class="pulse"></div>Captura Interrompida';
    fetch('/stop').then(res => res.text()).then(console.log);
    safeSetTimeout(() => {
        if (!state.sequenceInProgress) {
            dom.status.innerHTML = '<div class="pulse"></div>Parado';
        }
    }, config.TOAST_DURATION_MS);
}

function sequenciaPreparacao() {
    dom.captureModal.className = 'capture-modal stage-preparacao';
    dom.stageEmoji.textContent = '🎯';
    dom.stageText.textContent = 'Prepare-se';
    dom.countdown.textContent = '';
    safeSetTimeout(() => { if (state.sequenceInProgress) sequenciaContagem(); }, config.PREPARATION_TIME_MS);
}

function sequenciaContagem() {
    dom.captureModal.className = 'capture-modal stage-contagem';
    dom.stageEmoji.textContent = '⏰';
    dom.stageText.textContent = 'Iniciando em...';
    let count = 3;
    function showCount() {
        if (!state.sequenceInProgress) return;
        dom.countdown.textContent = count;
        dom.countdown.style.animation = 'none';
        void dom.countdown.offsetHeight;
        dom.countdown.style.animation = 'pulse-number 1s ease-in-out';
        if (count > 1) {
            count--;
            safeSetTimeout(showCount, config.COUNTDOWN_STEP_MS);
        } else {
            safeSetTimeout(() => { if (state.sequenceInProgress) sequenciaExpressaoSeria(); }, config.COUNTDOWN_STEP_MS);
        }
    }
    showCount();
}

function sequenciaExpressaoSeria() {
    dom.captureModal.className = 'capture-modal stage-seria';
    dom.stageEmoji.textContent = '😐';
    dom.stageText.textContent = 'Faça uma expressão séria';
    dom.countdown.textContent = '';
    dom.progressContainer.style.display = 'none';
    state.isCapturing = true;
    state.startTime = Date.now();
    fetch('/start').then(res => res.text()).then(console.log);
    dom.status.className = 'status recording';
    dom.status.innerHTML = '<div class="pulse"></div>Preparando - Expressão Séria';
    safeSetTimeout(() => {
        if (state.sequenceInProgress) iniciarContagemExpressao('Expressão Séria', sequenciaExpressaoSorriso);
    }, config.PREPARATION_TIME_MS);
}

function sequenciaExpressaoSorriso() {
    dom.captureModal.className = 'capture-modal stage-sorriso';
    dom.stageEmoji.textContent = '😊';
    dom.stageText.textContent = 'Pronto para sorrir?';
    dom.progressContainer.style.display = 'none';
    dom.status.innerHTML = '<div class="pulse"></div>Preparando - Sorriso';
    safeSetTimeout(() => {
        if (state.sequenceInProgress) iniciarContagemExpressao('Faça um Sorriso!', sequenciaSucesso);
    }, config.PREPARATION_TIME_MS);
}

function iniciarContagemExpressao(texto, proximaEtapa) {
    dom.stageText.textContent = texto;
    dom.progressContainer.style.display = 'block';
    dom.modalControls.style.display = 'block';
    dom.status.innerHTML = `<div class="pulse"></div>Gravando - ${texto}`;
    dom.progressFill.style.width = '0%';
    dom.progressText.textContent = '0s';
    let progress = 0;
    const totalSteps = config.EXPRESSION_DURATION_S * (1000 / config.PROGRESS_INTERVAL_MS);
    const progressIncrement = 100 / totalSteps;
    const intervalId = setInterval(() => {
        if (!state.sequenceInProgress) return clearInterval(intervalId);
        progress += progressIncrement;
        dom.progressFill.style.width = `${progress}%`;
        dom.progressText.textContent = `${Math.ceil(progress / (100 / config.EXPRESSION_DURATION_S))}s`;
        if (progress >= 100) {
            clearInterval(intervalId);
            safeSetTimeout(() => { if (state.sequenceInProgress) proximaEtapa(); }, 500);
        }
    }, config.PROGRESS_INTERVAL_MS);
    state.activeTimers.push(intervalId);
}

function sequenciaSucesso() {
    dom.captureModal.className = 'capture-modal stage-sucesso';
    dom.stageEmoji.textContent = '🎉';
    dom.stageText.textContent = 'Sucesso!';
    dom.countdown.textContent = 'Captura Finalizada';
    dom.progressContainer.style.display = 'none';
    dom.modalControls.style.display = 'none';
    state.isCapturing = false;
    fetch('/stop').then(res => res.text()).then(console.log);
    dom.status.className = 'status stopped';
    dom.status.innerHTML = '<div class="pulse"></div>Captura Concluída';
    safeSetTimeout(() => {
        if (!state.sequenceInProgress) return;
        dom.captureModal.style.display = 'none';
        dom.startBtn.disabled = false;
        state.sequenceInProgress = false;
        dom.status.innerHTML = '<div class="pulse"></div>Parado';
        mostrarToast('Captura realizada com sucesso!');
    }, config.TOAST_DURATION_MS);
}

function fetchData() {
    if (state.isCapturing) {
        fetch('/data')
            .then(response => response.text())
            .then(data => {
                if (data && data.trim() !== '') {
                    const processedData = processarDadosComTimestamp(data);
                    dom.csvArea.value = processedData;
                    atualizarEstatisticas(processedData);
                }
            })
            .catch(error => console.error('Erro ao buscar dados:', error));
    }
}

function processarDadosComTimestamp(csvData) {
    const lines = csvData.trim().split('\n');
    const currentTimestamp = Date.now();
    
    const processedLines = lines.map((line, index) => {
        if (line.includes('Timestamp') || !line.includes(',')) {
            return line;
        }
        
        const data = line.split(',');
        if (data.length < 2) return line;

        if (!data[0] || isNaN(parseInt(data[0]))) {
            const timestamp = Math.floor((currentTimestamp + (index * 100)) / 1000);
            data[0] = timestamp.toString();
            return data.join(',');
        }
        
        return line;
    });
    
    return processedLines.join('\n');
}

function atualizarEstatisticas(csvData) {
    const lines = csvData.trim().split('\n');
    const dataLines = lines.filter(line => line.includes(',') && !line.includes('Timestamp'));
    if (dataLines.length === 0) return;
    dom.sampleCount.textContent = dataLines.length;
    if (state.startTime) {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        dom.recordingTime.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    const lastLine = dataLines[dataLines.length - 1].split(',');
    if (lastLine.length >= 2) dom.currentAmplitude.textContent = `${lastLine[1]} mV`;
    if (lastLine.length >= 3) {
        const frequencies = dataLines.map(line => parseFloat(line.split(',')[2]) || 0);
        const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
        dom.avgFrequency.textContent = `${avgFreq.toFixed(1)} Hz`;
    }
    atualizarTabela(dataLines);
}

function atualizarTabela(dataLines) {
    const recentLines = dataLines.slice(-10);
    dom.dataTableBody.innerHTML = '';
    
    recentLines.forEach(line => {
        const data = line.split(',');
        if (data.length < 3) return;

        const row = dom.dataTableBody.insertRow();
        const cellTime = row.insertCell(0);
        
        cellTime.textContent = formatarTimestamp(data[0]);
        
        const amplitude = parseFloat(data[1]);
        const cellAmp = row.insertCell(1);
        cellAmp.textContent = `${data[1]} mV`;
        cellAmp.className = amplitude >= 0 ? 'amplitude-positive' : 'amplitude-negative';
        
        row.insertCell(2).textContent = `${data[2]} Hz`;
        
        const quality = Math.abs(amplitude) > 0.1 ? 'Boa' : 'Baixa';
        const cellQuality = row.insertCell(3);
        cellQuality.textContent = quality;
        cellQuality.style.color = quality === 'Boa' ? '#27ae60' : '#f39c12';
        
        const cellExport = row.insertCell(4);
        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn-export';
        exportBtn.innerHTML = '💾 Baixar';
        exportBtn.addEventListener('click', () => exportarLinha(line));
        cellExport.appendChild(exportBtn);
    });
}

function limparRegistro() {
    dom.dataTableBody.innerHTML = '';
    dom.currentAmplitude.textContent = '0.00 mV';
    dom.avgFrequency.textContent = '0.0 Hz';
    dom.sampleCount.textContent = '0';
    dom.recordingTime.textContent = '00:00';
    mostrarToast('Registro limpo com sucesso!');
}

function exportarLinha(linhaDados) {
    const header = 'Data e Hora,Amplitude (mV),Frequência (Hz),Qualidade\n';
    const data = linhaDados.split(',');
    if (data.length < 3) return;
    
    const timestampFormatado = formatarTimestamp(data[0]);
    const amplitude = parseFloat(data[1]);
    const quality = Math.abs(amplitude) > 0.1 ? 'Boa' : 'Baixa';
    const csvLine = `${timestampFormatado},${data[1]} mV,${data[2]} Hz,${quality}\n`;
    
    const nomeArquivo = `emg_linha_${gerarTimestampArquivo()}.csv`;
    baixarArquivo(header + csvLine, nomeArquivo);
    mostrarToast(`Linha exportada: ${nomeArquivo}`);
}

function baixar() {
    if (!dom.csvArea.value || dom.csvArea.value.trim() === '') {
        return mostrarToast('Nenhum dado para exportar!');
    }
    
    const lines = dom.csvArea.value.trim().split('\n');
    const dataLines = lines.filter(line => line.includes(',') && !line.includes('Timestamp'));
    
    const header = 'Data e Hora,Amplitude (mV),Frequência (Hz),Qualidade,Timestamp Original\n';
    
    const processedLines = dataLines.map(line => {
        const data = line.split(',');
        if (data.length < 3) return null;
        
        const timestampFormatado = formatarTimestamp(data[0]);
        const amplitude = parseFloat(data[1]);
        const quality = Math.abs(amplitude) > 0.1 ? 'Boa' : 'Baixa';
        
        return `${timestampFormatado},${data[1]} mV,${data[2]} Hz,${quality},${data[0]}`;
    }).filter(line => line !== null);
    
    const csvContent = header + processedLines.join('\n') + '\n';
    
    const nomeArquivo = `emg_facial_${gerarTimestampArquivo()}.csv`;
    baixarArquivo(csvContent, nomeArquivo);
    mostrarToast(`${processedLines.length} registros exportados: ${nomeArquivo}`);
}

function baixarArquivo(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function mostrarToast(mensagem) {
    dom.toast.textContent = mensagem;
    dom.toast.style.display = 'block';
    dom.toast.style.opacity = '1';
    safeSetTimeout(() => {
        dom.toast.style.opacity = '0';
        safeSetTimeout(() => { dom.toast.style.display = 'none'; }, 400);
    }, config.TOAST_DURATION_MS);
}

function clearAllTimers() {
    state.activeTimers.forEach(id => {
        clearTimeout(id);
        clearInterval(id);
    });
    state.activeTimers = [];
}

function safeSetTimeout(callback, delay) {
    const id = setTimeout(() => {
        state.activeTimers = state.activeTimers.filter(timerId => timerId !== id);
        callback();
    }, delay);
    state.activeTimers.push(id);
}