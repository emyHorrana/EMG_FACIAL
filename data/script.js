function startGravacao() {
  fetch('/start')
    .then(response => response.text())
    .then(msg => console.log(msg));
}

// Atualiza o CSV a cada 1 segundo
setInterval(() => {
  fetch('/data')
    .then(response => response.text())
    .then(data => {
      document.getElementById("csvArea").value = data;
    });
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
