from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def home():
    return jsonify({"status": "CallSync rodando", "versao": "1.0"})

@app.route('/chamados')
def listar_chamados():
    return jsonify([
        {"id": 1, "titulo": "Computador nao liga", "status": "Aguardando"},
        {"id": 2, "titulo": "Sem acesso a rede", "status": "Em atendimento"}
    ])

if __name__ == '__main__':
    app.run(debug=True)