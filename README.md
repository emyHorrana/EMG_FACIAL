# EMG Facial

Protótipo de aquisição, filtragem e visualização em tempo real de sinais de eletromiografia (EMG) de superfície do músculo zigomático maior, usando ESP32.

Este repositório acompanha um trabalho de iniciação científica em estágio preliminar. O sistema mede **ativação muscular** — não detecta emoções nem substitui métodos validados de avaliação afetiva.

## O que o sistema faz

- Captura o sinal EMG bruto via ADC do ESP32.
- Aplica uma cadeia de filtros (passa-alta, notch de rede elétrica, retificação e média móvel) para gerar um envelope de intensidade da contração.
- Transmite os dados em tempo real para uma interface web via WebSocket.
- Permite iniciar/parar a captura e exportar os dados de uma sessão em CSV.

## Arquitetura

- **Firmware (`src/main.cpp`)**: ESP32 configurado como Access Point WiFi, amostrando o sinal a 1kHz nominal. Serve a interface web (arquivos estáticos via LittleFS) e transmite as amostras em tempo real por WebSocket (porta 81). As rotas HTTP `/start` e `/stop` controlam o início/fim da gravação.
- **Interface (`data/`)**: página web (HTML/CSS/JS puro, sem frameworks) que se conecta ao WebSocket do ESP32, desenha o sinal bruto e filtrado em um `<canvas>` e permite exportar a sessão em CSV.

### Cadeia de processamento do sinal

```
ADC bruto → passa-alta (~20Hz) → notch (60Hz) → retificação → média móvel → envelope
```

- **Passa-alta (~20Hz)**: remove deriva de linha de base e artefatos de movimento lento.
- **Notch (60Hz)**: atenua interferência da rede elétrica (ajustável para 50Hz em `main.cpp`, conforme a região).
- **Retificação + média móvel**: converte o sinal filtrado em um envelope linear, representando a intensidade de ativação muscular ao longo do tempo.

## Como usar

### Pré-requisitos
- [PlatformIO](https://platformio.org/) (extensão do VS Code ou CLI)
- Placa ESP32
- Sensor EMG (testado com Muscle Sensor v3) com eletrodos de superfície Ag/AgCl

### Instalação

```bash
git clone <url-do-repositorio>
cd EMG_FACIAL
```

Abra a pasta no VS Code com a extensão PlatformIO, conecte o ESP32 via USB e:

1. Envie o sistema de arquivos (interface web) — comando **Upload Filesystem Image** no PlatformIO.
2. Compile e grave o firmware — `Ctrl+Alt+U` ou o botão de upload.

### Uso

1. Conecte-se à rede WiFi `ESP32_AP` (senha `12345678`).
2. Acesse `http://192.168.4.1` no navegador.
3. Use os botões da interface para iniciar/parar a captura e exportar os dados.

## Estrutura do repositório

```
EMG_FACIAL/
├── platformio.ini      # Configuração do projeto (placa, dependências)
├── src/
│   └── main.cpp         # Firmware do ESP32
└── data/                 # Interface web, servida pelo ESP32 via LittleFS
    ├── index.html
    ├── style.css
    ├── script.js
    └── animations.js
```

## Especificações técnicas

- **Taxa de amostragem nominal**: 1000 Hz
- **Resolução do ADC**: 12 bits (0–4095), faixa 0–3,3V
- **Comunicação em tempo real**: WebSocket (porta 81)
- **Formato de exportação**: CSV (tempo, amplitude filtrada, amplitude bruta)


