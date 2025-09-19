class ElectrodeMonitor {
    constructor() {
        this.isRecording = false;
        this.data = [];
        this.chart = null;
        this.recordingStartTime = null;
        this.recordingInterval = null;
        this.timeInterval = null;
        this.initChart();
        this.bindEvents();
    }

    initChart() {
        const ctx = document.getElementById('signalChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Sinal do Eletrodo (mV)',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Tempo (s)'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Amplitude (mV)'
                        },
                        min: -5,
                        max: 5
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
    }

    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.startRecording());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearData());
    }

    clearData() {
        this.data = [];
        // Limpa tabela
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '';
        // Limpa gráfico
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.update('none');
        // Zera estatísticas
        document.getElementById('currentAmplitude').textContent = '0.00 mV';
        document.getElementById('avgFrequency').textContent = '0.0 Hz';
        document.getElementById('sampleCount').textContent = '0';
        document.getElementById('recordingTime').textContent = '00:00';
    }

    startRecording() {
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('status').className = 'status recording';
        document.getElementById('status').innerHTML = '<div class="pulse"></div>Gravando';
        this.recordingInterval = setInterval(() => {
            this.captureData();
        }, 100);
        this.timeInterval = setInterval(() => {
            this.updateRecordingTime();
        }, 1000);
    }

    stopRecording() {
        this.isRecording = false;
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
        }
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
        }
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('status').className = 'status stopped';
        document.getElementById('status').innerHTML = '<div class="pulse"></div>Parado';
    }

    captureData() {
        const now = Date.now();
        const timeFromStart = (now - this.recordingStartTime) / 1000;
        const baseFreq = 1.5;
        const noiseLevel = 0.3;
        const amplitude = 2.5 + Math.sin(timeFromStart * 0.5) * 1.5;
        const signal = amplitude * Math.sin(2 * Math.PI * baseFreq * timeFromStart) +
                      0.5 * Math.sin(2 * Math.PI * baseFreq * 3 * timeFromStart) +
                      (Math.random() - 0.5) * noiseLevel;
        const frequency = baseFreq + (Math.random() - 0.5) * 0.5;
        const quality = this.calculateQuality(signal);
        const dataPoint = {
            timestamp: new Date(now),
            time: timeFromStart,
            amplitude: signal,
            frequency: frequency,
            quality: quality
        };
        this.data.push(dataPoint);
        this.updateChart(dataPoint);
        this.updateStats(dataPoint);
        this.updateTable(dataPoint);
    }

    calculateQuality(signal) {
        const absSignal = Math.abs(signal);
        if (absSignal > 3) return 'Excelente';
        if (absSignal > 2) return 'Boa';
        if (absSignal > 1) return 'Regular';
        return 'Baixa';
    }

    updateChart(dataPoint) {
        const maxPoints = 100;
        this.chart.data.labels.push(dataPoint.time.toFixed(1));
        this.chart.data.datasets[0].data.push(dataPoint.amplitude);
        if (this.chart.data.labels.length > maxPoints) {
            this.chart.data.labels.shift();
            this.chart.data.datasets[0].data.shift();
        }
        this.chart.update('none');
    }

    updateStats(dataPoint) {
        document.getElementById('currentAmplitude').textContent = 
            `${dataPoint.amplitude.toFixed(2)} mV`;
        const avgFreq = this.data.reduce((sum, d) => sum + d.frequency, 0) / this.data.length;
        document.getElementById('avgFrequency').textContent = 
            `${avgFreq.toFixed(1)} Hz`;
        document.getElementById('sampleCount').textContent = this.data.length;
    }

    updateTable(dataPoint) {
        const tbody = document.getElementById('dataTableBody');
        const row = document.createElement('tr');
        const amplitudeClass = dataPoint.amplitude >= 0 ? 'amplitude-positive' : 'amplitude-negative';
        row.innerHTML = `
            <td>${dataPoint.timestamp.toLocaleTimeString()}</td>
            <td class="${amplitudeClass}">${dataPoint.amplitude.toFixed(3)}</td>
            <td>${dataPoint.frequency.toFixed(2)}</td>
            <td>${dataPoint.quality}</td>
        `;
        tbody.insertBefore(row, tbody.firstChild);
        while (tbody.children.length > 50) {
            tbody.removeChild(tbody.lastChild);
        }
    }

    updateRecordingTime() {
        if (!this.recordingStartTime) return;
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('recordingTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    exportData() {
        if (this.data.length === 0) {
            alert('Nenhum dado para exportar. Inicie uma gravação primeiro.');
            return;
        }
        const csvContent = this.generateCSV();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const fileName = `dados_eletrodo_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showToast(`Dados exportados com sucesso como ${fileName}`);
        }
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 400);
        }, 2500);
    }

    generateCSV() {
        const headers = ['Timestamp', 'Tempo (s)', 'Amplitude (mV)', 'Frequência (Hz)', 'Qualidade'];
        const rows = this.data.map(d => [
            d.timestamp.toISOString(),
            d.time.toFixed(3),
            d.amplitude.toFixed(6),
            d.frequency.toFixed(3),
            d.quality
        ]);
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new ElectrodeMonitor();
});
