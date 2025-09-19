#include <WiFi.h>
#include <WebServer.h>

#define ANALOG_PIN_1 34        // pino 34 como entrada analógica
#define SAMPLE_INTERVAL_US 1000  // intervalo entre amostras (1ms = 1000 Hz)
#define RECORD_DURATION_MS 3000  // duração da gravação (3 segundos)
#define MAX_SAMPLES (RECORD_DURATION_MS)  // 1 amostra por ms (máximo 3000 amostras)
#define WINDOW 10  // tamanho da janela da média móvel
int filtroBuffer[WINDOW];
long filtroSoma = 0;
int filtroIndice = 0;
int filtroCount = 0;

const char* ssid = "ESP32_CSV"; 
const char* password = "12345678"; 
WebServer server(80);

uint16_t bufferSignalRaw[MAX_SAMPLES];        // sinal bruto
uint16_t bufferSignalFiltrado[MAX_SAMPLES];   // sinal filtrado
uint32_t bufferTime[MAX_SAMPLES];             
int sampleCount = 0;

String csvData = "Tempo (ms),Bruto,Filtrado\n";
bool recording = false;
unsigned long startTime = 0;
unsigned long lastSampleTime = 0;

// --------------------- FILTRO MEDIA MOVEL -----------------

int mediaMovel(int novoValor) {
  filtroSoma -= filtroBuffer[filtroIndice];   // remove valor antigo
  filtroBuffer[filtroIndice] = novoValor;     // insere novo valor
  filtroSoma += novoValor;                    // soma valor novo

  filtroIndice = (filtroIndice + 1) % WINDOW; // índice circular
  if (filtroCount < WINDOW) filtroCount++;    // aumenta contagem até encher janela

  return filtroSoma / filtroCount;            // retorna média
}

void handleRoot() {
  String html = R"rawliteral(
    <!DOCTYPE html>
    <html>
    <head>
      <title>Coleta ESP32</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial; text-align: center; margin: 20px; }
        textarea { width: 90%; height: 300px; }
        button { padding: 10px 20px; margin: 10px; font-size: 16px; }
      </style>
    </head>
    <body>
      <h2>Coleta de Dados Analógicos</h2>
      <button onclick="startGravacao()">Iniciar Gravação</button>
      <button onclick="copiar()">Copiar CSV</button>
      <button onclick="baixar()">Baixar CSV</button>

      <textarea id="csvArea" readonly></textarea>
      <script>
        function startGravacao() {
          fetch('/start');
        }
        setInterval(() => {
          fetch('/data')
            .then(response => response.text())
            .then(data => { document.getElementById("csvArea").value = data; });
        }, 1000);

        function copiar() {
          let txt = document.getElementById("csvArea");
          txt.select();
          document.execCommand("copy");
        }

        function baixar() {
          const blob = new Blob([document.getElementById("csvArea").value], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "dados.csv";
          a.click();
          URL.revokeObjectURL(url);
        }
      </script>
    </body>
    </html>
  )rawliteral";

  server.send(200, "text/html", html);
}

void handleStart() {
  if (!recording) {
    sampleCount = 0;
    csvData = "Tempo (ms),Bruto,Filtrado\n";
    startTime = millis();
    lastSampleTime = micros();
    recording = true;
  }
  server.send(200, "text/plain", "Gravando...");
}

void handleData() {
  server.send(200, "text/plain", csvData);
}

void setup() {
  Serial.begin(115200);
  WiFi.softAP(ssid, password);
  Serial.print("IP: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/start", handleStart);
  server.on("/data", handleData);
  server.begin();
}

void loop() {
  server.handleClient();

  if (recording) {
    unsigned long now_us = micros();
    unsigned long elapsed_ms = millis() - startTime;

    if (elapsed_ms <= RECORD_DURATION_MS && (now_us - lastSampleTime >= SAMPLE_INTERVAL_US)) {
      lastSampleTime = now_us;

      if (sampleCount < MAX_SAMPLES) {
        int leitura = analogRead(ANALOG_PIN_1);         // sinal bruto
        int filtrado = mediaMovel(leitura);             // sinal filtrado

        bufferTime[sampleCount] = elapsed_ms;
        bufferSignalRaw[sampleCount] = leitura;
        bufferSignalFiltrado[sampleCount] = filtrado;
        sampleCount++;
      }
    }

    if (elapsed_ms > RECORD_DURATION_MS) {
      // Monta CSV
      for (int i = 0; i < sampleCount; i++) {
        csvData += String(bufferTime[i]) + "," +
                   String(bufferSignalRaw[i]) + "," +
                   String(bufferSignalFiltrado[i]) + "\n";
      }
      recording = false;
    }
  }
}
