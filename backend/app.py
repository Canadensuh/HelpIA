import os
import secrets
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

from backend.aplicacao.servico_chamado import ChamadoNaoEncontrado, ServicoChamado
from backend.aplicacao.servico_conta import (
    AcessoNegado,
    CredenciaisInvalidas,
    EmailJaCadastrado,
    LimiteDoPlano,
    ServicoConta,
)
from backend.aplicacao.servico_notificacao import mensagem_confirmacao
from backend.dominio.chamado import DescricaoInsuficiente
from backend.dominio.usuario import PLANOS, DadosInvalidos
from backend.persistencia.repositorio_chamado import RepositorioChamadoMemoria
from backend.persistencia.repositorio_usuario import RepositorioUsuarioMemoria

PASTA_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


def criar_app(com_exemplos: bool = True, chave_secreta: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=str(PASTA_FRONTEND), static_url_path="")
    app.json.ensure_ascii = False

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Sem HELPIA_SECRET_KEY, cada execução gera uma chave nova (as sessões caem ao
    # reiniciar, assim como os dados em memória). Em produção, defina a variável.
    chave = chave_secreta or os.environ.get("HELPIA_SECRET_KEY") or secrets.token_hex(32)

    servico = ServicoChamado(RepositorioChamadoMemoria())
    contas = ServicoConta(RepositorioUsuarioMemoria(), chave)

    if com_exemplos:
        servico.popular_exemplos()
        contas.popular_exemplos()

    def usuario_logado():
        cabecalho = request.headers.get("Authorization", "")
        if not cabecalho.startswith("Bearer "):
            raise CredenciaisInvalidas("Faça login para continuar.")
        return contas.usuario_do_token(cabecalho.removeprefix("Bearer ").strip())

    @app.get("/")
    def inicio():
        return app.send_static_file("index.html")

    @app.get("/api/status")
    def status():
        return jsonify({"sistema": "HelpIA", "status": "online", "versao": "1.1"})

    # ---------- Planos, contratação e contas ----------
    @app.get("/api/planos")
    def listar_planos():
        return jsonify([{"id": chave_plano, **dados} for chave_plano, dados in PLANOS.items()])

    @app.post("/api/empresas")
    def contratar():
        dados = request.get_json(silent=True) or {}
        empresa = dados.get("empresa") or {}
        responsavel = dados.get("responsavel") or {}
        sessao = contas.contratar(
            plano=dados.get("plano", ""),
            nome_empresa=empresa.get("nome", ""),
            cnpj=empresa.get("cnpj", ""),
            nome_responsavel=responsavel.get("nome", ""),
            email=responsavel.get("email", ""),
            senha=responsavel.get("senha", ""),
        )
        return jsonify(sessao), 201

    @app.post("/api/auth/login")
    def login():
        dados = request.get_json(silent=True) or {}
        sessao = contas.autenticar(dados.get("email", ""), dados.get("senha", ""), dados.get("perfil"))
        return jsonify(sessao)

    @app.get("/api/auth/eu")
    def eu():
        return jsonify(contas.perfil_publico(usuario_logado()))

    @app.get("/api/contas")
    def listar_contas():
        return jsonify([u.to_dict() for u in contas.listar_contas(usuario_logado())])

    @app.post("/api/contas")
    def criar_conta():
        gestor = usuario_logado()
        dados = request.get_json(silent=True) or {}
        usuario = contas.criar_conta(
            gestor,
            nome=dados.get("nome", ""),
            email=dados.get("email", ""),
            perfil=dados.get("perfil", ""),
            senha=dados.get("senha", ""),
        )
        return jsonify(usuario.to_dict()), 201

    # ---------- Chamados ----------
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
        except DescricaoInsuficiente as erro:
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
    # O Flask escolhe o tratador da classe mais específica, então as
    # subclasses de ValueError abaixo não caem no 409 genérico.
    @app.errorhandler(ChamadoNaoEncontrado)
    def nao_encontrado(erro):
        return jsonify({"erro": str(erro)}), 404

    @app.errorhandler(CredenciaisInvalidas)
    def nao_autenticado(erro):
        return jsonify({"erro": str(erro)}), 401

    @app.errorhandler(AcessoNegado)
    def sem_permissao(erro):
        return jsonify({"erro": str(erro)}), 403

    @app.errorhandler(EmailJaCadastrado)
    @app.errorhandler(LimiteDoPlano)
    def conflito_conta(erro):
        return jsonify({"erro": str(erro)}), 409

    @app.errorhandler(DadosInvalidos)
    def dados_invalidos(erro):
        return jsonify({"erro": str(erro)}), 422

    @app.errorhandler(ValueError)
    def transicao_invalida(erro):
        return jsonify({"erro": str(erro)}), 409

    return app


app = criar_app()

if __name__ == "__main__":
    app.run(debug=True)
