"""Camada de Interface — API REST (Flask) e servidor das telas do frontend.

Executar a partir da raiz do projeto:
    python -m backend.app
e abrir http://localhost:5000
"""
from pathlib import Path

from flask import Flask, jsonify, request

from backend.aplicacao.servico_chamado import ChamadoNaoEncontrado, ServicoChamado
from backend.aplicacao.servico_notificacao import mensagem_confirmacao
from backend.dominio.chamado import DescricaoInsuficiente
from backend.persistencia.repositorio_chamado import RepositorioChamadoMemoria

PASTA_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


def criar_app(com_exemplos: bool = True) -> Flask:
    app = Flask(__name__, static_folder=str(PASTA_FRONTEND), static_url_path="")
    app.json.ensure_ascii = False

    servico = ServicoChamado(RepositorioChamadoMemoria())
    if com_exemplos:
        servico.popular_exemplos()

    # ---------- Telas ----------
    @app.get("/")
    def inicio():
        return app.send_static_file("index.html")

    # ---------- API ----------
    @app.get("/api/status")
    def status():
        return jsonify({"sistema": "HelpIA", "status": "online", "versao": "1.0"})

    @app.get("/api/chamados")
    def listar_chamados():
        chamados = servico.listar(
            status=request.args.get("status"),
            solicitante=request.args.get("solicitante"),
        )
        return jsonify([c.to_dict() for c in chamados])

    @app.post("/api/chamados")
    def abrir_chamado():
        dados = request.get_json(silent=True) or {}
        try:
            chamado = servico.abrir(dados.get("descricao", ""), dados.get("solicitante", ""))
        except DescricaoInsuficiente as erro:  # RN-01
            return jsonify({"precisa_complemento": True, "mensagem": str(erro)}), 422
        return jsonify({"chamado": chamado.to_dict(), "mensagem": mensagem_confirmacao(chamado)}), 201

    @app.get("/api/chamados/<int:numero>")
    def obter_chamado(numero):
        return jsonify(servico.obter(numero).to_dict())

    @app.post("/api/chamados/<int:numero>/assumir")
    def assumir_chamado(numero):
        dados = request.get_json(silent=True) or {}
        return jsonify(servico.assumir(numero, dados.get("analista", "")).to_dict())

    @app.post("/api/chamados/<int:numero>/resolver")
    def resolver_chamado(numero):
        return jsonify(servico.resolver(numero).to_dict())

    # ---------- Erros ----------
    @app.errorhandler(ChamadoNaoEncontrado)
    def nao_encontrado(erro):
        return jsonify({"erro": str(erro)}), 404

    @app.errorhandler(ValueError)
    def transicao_invalida(erro):
        return jsonify({"erro": str(erro)}), 409

    return app


app = criar_app()

if __name__ == "__main__":
    app.run(debug=True)
