#include <Wifi.h>
#include <WebServer.h>
#define ANALOG_PIN_1 34 // pino 34 como entrada analógica
#define SAMPLE_INTERVAL_US 1000  // 1ms = 1000Hz
#define RECORD_DURATION_MS 3000  // duração em milissegundos (3 segundos)
#define MAX_SAMPLES (RECORD_DURATION_MS)  // 1 amostra por ms (máximo 3000 amostras)

const char* ssid = "ESP32_CSV"; // nome da rede
const char* password = "12345678"; // senha da rede

WebServer server(80); // porta 80 para páginas web

// Buffers de armazenamento
uint16_t bufferSignal[MAX_SAMPLES]; // armazenas os valores lidos
uint32_t bufferTime[MAX_SAMPLES]; // guarda o tempo em ms de cada leitura
int sampleCount = 0; // contar a quantidade de amostras coletadas

String csvData = "Tempo (ms),Valor\n";
bool recording = false; // gravação dos dados sim ou não
unsigned long startTime = 0; // quando a gravação começou
unsigned long lastSampleTime = 0; // última amostra feita

//Envia uma página HTML para o navegador quando acesso por IP
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
        setInterval() => {
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

//Controle da gravação
void handleStart() {
  if (!recording) {
    sampleCount = 0;
    csvData = "Tempo (ms),Valor1\n";
    startTime = millis();
    lastSampleTime = micros();
    recording = true;
  }
  server.send(200, "text/plain", "Gravando...");
}

//Envio de dados
void handleData() {
  server.send(200, "text/plain", csvData);
}

void setup() {
  Serial.begin(115200);
  WiFi.softAP(ssid, password);
  Serial.print("IP: "); // mostra o IP do ESP32
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);       // página HTML
  server.on("/start", handleStart); // inicia gravação
  server.on("/data", handleData);   // envia os dados
  server.begin(); // inicia o servidor
}

void loop() {
  server.handleClient(); 

  if (recording) {
    unsigned long now_us = micros();
    unsigned long elapsed_ms = millis() - startTime;

    if (elapsed_ms <= RECORD_DURATION_MS && (now_us - lastSampleTime >= SAMPLE_INTERVAL_US)) {
      lastSampleTime = now_us;

      if (sampleCount < MAX_SAMPLES) {
        bufferTime[sampleCount] = elapsed_ms;
        bufferSignal[sampleCount] = analogRead(ANALOG_PIN_1);
        sampleCount++;
      }
    }

    if (elapsed_ms > RECORD_DURATION_MS) {
      // Monta CSV após gravação
      for (int i = 0; i < sampleCount; i++) {
        csvData += String(bufferTime[i]) + "," + String(bufferSignal[i]) + "\n";
      }
      recording = false;
    }
  }
}