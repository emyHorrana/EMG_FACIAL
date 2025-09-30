#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>

#define ANALOG_PIN_1 34        
#define SAMPLE_INTERVAL_US 1000  
#define RECORD_DURATION_MS 3000  
#define MAX_SAMPLES (RECORD_DURATION_MS)  
#define WINDOW 10  
// Configurações do Wi-Fi (Access Point)
const char *ssid = "ESP32_AP";
const char *password = "12345678";

WebServer server(80);


// ---------------- VARIÁVEIS ----------------
int filtroBuffer[WINDOW];
long filtroSoma = 0;
int filtroIndice = 0;
int filtroCount = 0;

uint16_t bufferSignalRaw[MAX_SAMPLES];        
uint16_t bufferSignalFiltrado[MAX_SAMPLES];   
uint32_t bufferTime[MAX_SAMPLES];             
int sampleCount = 0;

String csvData = "Tempo (ms),Bruto,Filtrado\n";
bool recording = false;
unsigned long startTime = 0;
unsigned long lastSampleTime = 0;

// ---------------- FILTRO ----------------
int mediaMovel(int novoValor) {
  filtroSoma -= filtroBuffer[filtroIndice];
  filtroBuffer[filtroIndice] = novoValor;
  filtroSoma += novoValor;

  filtroIndice = (filtroIndice + 1) % WINDOW;
  if (filtroCount < WINDOW) filtroCount++;

  return filtroSoma / filtroCount;
}

// Função para determinar o tipo de conteúdo
String getContentType(String filename) {
  if (filename.endsWith(".htm") || filename.endsWith(".html")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".png")) return "image/png";
  else if (filename.endsWith(".jpg")) return "image/jpeg";
  else if (filename.endsWith(".ico")) return "image/x-icon";
  else if (filename.endsWith(".json")) return "application/json";
  return "text/plain";
}

// Função para servir arquivos do LittleFS
bool handleFileRead(String path) {
  if (path.endsWith("/")) path += "index.html";  // abre index.html por padrão
  String contentType = getContentType(path);
  File file = LittleFS.open(path, "r");
  if (!file) {
    Serial.println("Arquivo não encontrado: " + path);
    return false;
  }
  server.streamFile(file, contentType);
  file.close();
  return true;
}

// ---------------- ROTAS ----------------
void handleNotFound() {
  String uri = server.uri();
  Serial.println("Requisição não encontrada: " + uri);

  if(!handleFileRead(uri)){
    server.send(404, "text/plain", "Arquivo não encontrado");
  }
}

void handleStart() {
  if(!recording){
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
  delay(1000);

  // Inicializa o LittleFS
  if (!LittleFS.begin()) {
    Serial.println("Erro ao montar LittleFS!");
    return;
  }
  Serial.println("LittleFS montado com sucesso");

  // Lista os arquivos carregados
  Serial.println("Arquivos disponíveis:");
  File root = LittleFS.open("/");
  File file = root.openNextFile();
  while (file) {
    Serial.println(String(" - ") + file.name());
    file = root.openNextFile();
  }

  // Cria o Access Point
  WiFi.softAP(ssid, password);
  Serial.println("Access Point iniciado");
  Serial.print("IP do AP: ");
  Serial.println(WiFi.softAPIP());

  // Rota padrão para arquivos
  server.onNotFound([]() {
    if (!handleFileRead(server.uri())) {
      server.send(404, "text/plain", "Arquivo não encontrado");
    }
  });

  // Evita warnings de favicon
  server.on("/favicon.ico", []() {
    server.send(204);
  });

  server.on("/start", handleStart);
  server.on("/data", handleData);

  server.begin();
  Serial.println("Servidor HTTP iniciado");
}

void loop() {
  server.handleClient();
   if(recording){
    unsigned long now_us = micros();
    unsigned long elapsed_ms = millis() - startTime;

    if(elapsed_ms <= RECORD_DURATION_MS && (now_us - lastSampleTime >= SAMPLE_INTERVAL_US)){
      lastSampleTime = now_us;

      if(sampleCount < MAX_SAMPLES){
        int leitura = analogRead(ANALOG_PIN_1);
        int filtrado = mediaMovel(leitura);

        bufferTime[sampleCount] = elapsed_ms;
        bufferSignalRaw[sampleCount] = leitura;
        bufferSignalFiltrado[sampleCount] = filtrado;
        sampleCount++;
      }
    }

    if(elapsed_ms > RECORD_DURATION_MS){
      for(int i=0; i<sampleCount; i++){
        csvData += String(bufferTime[i]) + "," +
                   String(bufferSignalRaw[i]) + "," +
                   String(bufferSignalFiltrado[i]) + "\n";
      }
      recording = false;
      Serial.println("Captura finalizada!");
    }
  }
}
