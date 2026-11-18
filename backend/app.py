"""HelpIA — servidor Flask (API + o site do frontend).

As rotas aqui são as mesmas que o simulador do frontend (js/simulador.js)
imita: com o backend no ar, o front fala com /api e o simulador fica
desligado. Cada rota só lê o pedido, chama a camada de aplicação e devolve
JSON; as regras ficam em backend/aplicacao e backend/dominio.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from backend.aplicacao.servico_anexos import LIMITE_ARQUIVO, ServicoAnexos
from backend.aplicacao.servico_chamado import ServicoChamado
from backend.aplicacao.servico_chat import ServicoChat
from backend.aplicacao.servico_conta import ServicoConta
from backend.aplicacao.servico_metas import ServicoMetas
from backend.aplicacao.servico_simulacao import ServicoSimulacao
from backend.dominio.erros import ErroHelpIA, NaoAutenticado
from backend.dominio.usuario import PLANOS
from backend.persistencia.banco import BancoMemoria

PASTA_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
VERSAO = "2.0"


def criar_app(com_exemplos: bool = True, chave_secreta: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=str(PASTA_FRONTEND), static_url_path="")
    app.json.ensure_ascii = False
    app.config["MAX_CONTENT_LENGTH"] = LIMITE_ARQUIVO + 1024 * 1024   # anexo + folga do formulário

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Sem HELPIA_SECRET_KEY, cada execução gera uma chave nova (as sessões caem ao
    # reiniciar, assim como os dados em memória). Em produção, defina a variável.
    chave = chave_secreta or os.environ.get("HELPIA_SECRET_KEY") or secrets.token_hex(32)

    banco = BancoMemoria()
    contas = ServicoConta(banco, chave)
    chat = ServicoChat(banco)
    chamados = ServicoChamado(banco, chat)
    metas = ServicoMetas(banco, chat)
    simulacao = ServicoSimulacao(banco, contas, chat, metas)
    anexos = ServicoAnexos(banco)

    if com_exemplos:
        simulacao.popular_exemplos()

    # Deixa os serviços à mão para os testes
    app.extensions["helpia"] = {"banco": banco, "contas": contas, "chat": chat, "chamados": chamados,
                                "metas": metas, "simulacao": simulacao, "anexos": anexos}

    def dados() -> dict:
        corpo = request.get_json(silent=True)
        return corpo if isinstance(corpo, dict) else {}

    def logado():
        cabecalho = request.headers.get("Authorization", "")
        if not cabecalho.startswith("Bearer "):
            raise NaoAutenticado("Faça login para continuar.")
        return contas.usuario_do_token(cabecalho.removeprefix("Bearer ").strip())

    # ---------- Site ----------
    @app.get("/")
    def inicio():
        return app.send_static_file("index.html")

    @app.get("/api/status")
    def status():
        return jsonify({"sistema": "HelpIA", "status": "online", "versao": VERSAO})

    # ---------- Planos, contratação e login ----------
    @app.get("/api/planos")
    def listar_planos():
        return jsonify([{"id": id_plano, **plano} for id_plano, plano in PLANOS.items()])

    @app.post("/api/empresas")
    def contratar():
        corpo = dados()
        return jsonify(contas.contratar(corpo.get("plano", ""), corpo.get("empresa") or {}, corpo.get("responsavel") or {})), 201

    @app.post("/api/auth/login")
    def login():
        corpo = dados()
        return jsonify(contas.autenticar(corpo.get("email", ""), corpo.get("senha", ""), corpo.get("perfil")))

    @app.get("/api/auth/eu")
    def eu():
        return jsonify(contas.perfil_publico(logado()))

    @app.post("/api/auth/senha")
    def trocar_senha():
        corpo = dados()
        contas.trocar_propria_senha(logado(), corpo.get("atual", ""), corpo.get("nova", ""))
        return jsonify({"ok": True})

    # ---------- Contas da equipe (gestor) ----------
    @app.get("/api/contas")
    def listar_contas():
        return jsonify([u.to_dict() for u in contas.listar_contas(logado())])

    @app.post("/api/contas")
    def criar_conta():
        corpo = dados()
        usuario = contas.criar_conta(logado(), corpo.get("nome", ""), corpo.get("email", ""),
                                     corpo.get("perfil", ""), corpo.get("senha", ""))
        return jsonify(usuario.to_dict()), 201

    @app.patch("/api/contas/<int:id_conta>")
    def atualizar_conta(id_conta):
        return jsonify(contas.atualizar_conta(logado(), id_conta, dados()).to_dict())

    @app.post("/api/contas/<int:id_conta>/senha")
    def redefinir_senha(id_conta):
        return jsonify(contas.redefinir_senha(logado(), id_conta, dados().get("senha", "")).to_dict())

    # ---------- Chamados (tickets) ----------
    @app.get("/api/chamados")
    def listar_chamados():
        lista = chamados.listar(logado(), request.args.get("status"), request.args.get("solicitante"))
        return jsonify([c.to_dict() for c in lista])

    @app.post("/api/chamados")
    def abrir_chamado():
        return jsonify(chamados.abrir(logado(), dados())), 201

    @app.get("/api/chamados/<int:numero>")
    def obter_chamado(numero):
        return jsonify(chamados.obter(logado(), numero).to_dict())

    @app.patch("/api/chamados/<int:numero>")
    def mudar_prioridade(numero):
        return jsonify(chamados.mudar_prioridade(logado(), numero, dados()).to_dict())

    @app.delete("/api/chamados/<int:numero>")
    def excluir_chamado(numero):
        return jsonify(chamados.excluir(logado(), numero))

    @app.post("/api/chamados/<int:numero>/ocultar")
    def ocultar_chamado(numero):
        return jsonify(chamados.ocultar(logado(), numero).to_dict())

    @app.post("/api/chamados/<int:numero>/assumir")
    def assumir_chamado(numero):
        return jsonify(chamados.assumir(logado(), numero).to_dict())

    @app.post("/api/chamados/<int:numero>/resolver")
    def resolver_chamado(numero):
        return jsonify(chamados.resolver(logado(), numero, dados().get("nota", "")).to_dict())

    @app.post("/api/chamados/<int:numero>/atribuir")
    def atribuir_chamado(numero):
        return jsonify(chamados.atribuir(logado(), numero, dados().get("analista_id")).to_dict())

    # ---------- HelpIA Chat ----------
    @app.get("/api/chat/conversas")
    def listar_conversas():
        return jsonify(chat.listar_conversas(logado()))

    @app.post("/api/chat/conversas")
    def abrir_conversa():
        usuario = logado()
        corpo = dados()
        try:
            com = int(corpo.get("com"))
        except (TypeError, ValueError):
            com = 0
        ticket = int(corpo["ticket"]) if corpo.get("ticket") else None
        return jsonify(chat.conversa_dict(chat.abrir_direta(usuario, com, ticket), usuario)), 201

    @app.patch("/api/chat/conversas/<int:id_conversa>")
    def atualizar_conversa(id_conversa):
        return jsonify(chat.atualizar(logado(), id_conversa, dados()))

    @app.get("/api/chat/nao-lidas")
    def nao_lidas():
        return jsonify({"total": chat.nao_lidas(logado())})

    @app.get("/api/chat/contatos")
    def contatos_chat():
        return jsonify(chat.contatos(logado()))

    @app.get("/api/chat/conversas/<int:id_conversa>/mensagens")
    def mensagens(id_conversa):
        return jsonify(chat.mensagens(logado(), id_conversa))

    @app.post("/api/chat/conversas/<int:id_conversa>/mensagens")
    def enviar_mensagem(id_conversa):
        return jsonify(chat.enviar(logado(), id_conversa, dados())), 201

    @app.delete("/api/chat/conversas/<int:id_conversa>/mensagens")
    def limpar_conversa(id_conversa):
        chat.limpar(logado(), id_conversa)
        return jsonify({"ok": True})

    @app.post("/api/chat/conversas/<int:id_conversa>/lida")
    def marcar_lida(id_conversa):
        chat.marcar_lida(logado(), id_conversa)
        return jsonify({"ok": True})

    # ---------- Anexos do chat ----------
    @app.post("/api/anexos")
    def enviar_anexo():
        usuario = logado()
        arquivo = request.files.get("arquivo")
        if arquivo is None:
            return jsonify({"erro": "Escolha um arquivo para anexar."}), 422
        meta = anexos.salvar(usuario, arquivo.filename or "", arquivo.mimetype or "", arquivo.read())
        return jsonify(meta), 201

    @app.get("/api/anexos/<id_anexo>")
    def baixar_anexo(id_anexo):
        anexo = anexos.obter(logado(), id_anexo)
        return Response(anexo["dados"], mimetype=anexo["tipo"],
                        headers={"Cache-Control": "private, max-age=86400"})

    # ---------- Metas ----------
    @app.get("/api/metas")
    def ver_metas():
        return jsonify(metas.ver(logado()))

    @app.patch("/api/metas")
    def salvar_metas():
        return jsonify(metas.salvar(logado(), dados()))

    @app.post("/api/metas/motivacionais")
    def adicionar_motivacional():
        return jsonify(metas.adicionar_motivacional(logado(), dados().get("texto", ""))), 201

    @app.delete("/api/metas/motivacionais/<int:id_mensagem>")
    def remover_motivacional(id_mensagem):
        return jsonify(metas.remover_motivacional(logado(), id_mensagem))

    # ---------- Modo simulação e Limpar dados (gestor) ----------
    @app.get("/api/simulacao")
    def estado_simulacao():
        return jsonify(simulacao.estado(logado()))

    @app.post("/api/simulacao")
    def definir_simulacao():
        return jsonify(simulacao.definir(logado(), dados().get("ativo")))

    @app.post("/api/simulacao/limpar")
    def limpar_dados():
        return jsonify(simulacao.limpar(logado()))

    # ---------- Erros ----------
    @app.errorhandler(ErroHelpIA)
    def erro_de_regra(erro: ErroHelpIA):
        return jsonify({"erro": erro.mensagem, **erro.extra}), erro.status

    @app.errorhandler(RequestEntityTooLarge)
    def arquivo_grande(_erro):
        return jsonify({"erro": "O arquivo passa de 25 MB."}), 413

    @app.errorhandler(HTTPException)
    def erro_http(erro: HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"erro": erro.description or erro.name}), erro.code
        return erro

    return app


app = criar_app()

if __name__ == "__main__":
    app.run(debug=True)
