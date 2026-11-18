import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app import criar_app
from backend.dominio import catalogo


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    """Servidor com os dados de demonstração (senha de todas as contas: 1234)."""
    return criar_app(com_exemplos=True, chave_secreta="teste").test_client()


def token(client, email, perfil="analista"):
    resposta = client.post("/api/auth/login", json={"email": email, "senha": "1234", "perfil": perfil})
    assert resposta.status_code == 200, resposta.get_json()
    return resposta.get_json()["token"]


@pytest.fixture
def gestor(client):
    return token(client, "murilonb@helpia.com.br")


@pytest.fixture
def carlos(client):
    return token(client, "carlos@helpia.com.br")


@pytest.fixture
def maria(client):
    return token(client, "maria@helpia.com.br", "colaborador")


def abrir(client, tk, **extra):
    dados = {"genero": "computador", "subgenero": "nao-liga", "impacto": "eu", "maquina": "043",
             "nota": "O computador não liga desde hoje cedo."}
    dados.update(extra)
    return client.post("/api/chamados", headers=auth(tk), json=dados)


# ---------- Domínio ----------

def test_nivel_de_prioridade():
    assert catalogo.nivel("setor", "energia", "eu") == "alta"
    assert catalogo.nivel("computador", "lento", "setor") == "alta"
    assert catalogo.nivel("computador", "lento", "equipe") == "media"
    assert catalogo.nivel("pedido", "mouse", "eu") == "baixa"
    assert catalogo.nivel("computador", "lento", "eu") == "normal"
    assert catalogo.nivel("computador", "lento", "eu", nivel_manual="alta") == "alta"


# ---------- Site e status ----------

def test_status_e_pagina_inicial(client):
    assert client.get("/api/status").get_json()["sistema"] == "HelpIA"
    assert client.get("/").status_code == 200


def test_rota_inexistente_responde_json(client):
    resposta = client.get("/api/nao-existe")
    assert resposta.status_code == 404
    assert "erro" in resposta.get_json()


# ---------- Abertura de chamados ----------

def test_colaborador_abre_ticket(client, maria):
    resposta = abrir(client, maria, contato={"tipo": "whatsapp", "valor": "(11) 98888-0043"})
    assert resposta.status_code == 201
    chamado = resposta.get_json()["chamado"]
    assert chamado["fila"] == "Suporte Técnico"
    assert chamado["solicitante"] == "Maria Oliveira"
    assert chamado["contato"]["tipo"] == "whatsapp"
    assert resposta.get_json()["mensagem"].startswith(f"Chamado {chamado['codigo']}")


def test_contato_extra_e_opcional(client, maria):
    assert abrir(client, maria, contato={"tipo": "whatsapp", "valor": ""}).get_json()["chamado"]["contato"] is None


def test_nota_curta_pede_complemento(client, maria):
    resposta = abrir(client, maria, nota="não liga")
    assert resposta.status_code == 422
    assert resposta.get_json()["precisa_complemento"] is True


def test_setor_parado_avisa_o_grupo(client, maria, carlos):
    abrir(client, maria, genero="setor", subgenero="energia", impacto="setor")
    grupo = next(c for c in client.get("/api/chat/conversas", headers=auth(carlos)).get_json() if c["tipo"] == "grupo")
    assert "prioridade ALTA" in grupo["ultima"]["texto"]


def test_colaborador_so_ve_os_proprios_tickets(client, maria):
    lista = client.get("/api/chamados", headers=auth(maria)).get_json()
    assert lista and all(c["solicitante"] == "Maria Oliveira" for c in lista)


# ---------- Atendimento ----------

def test_assumir_e_carimbar(client, maria, carlos):
    numero = abrir(client, maria).get_json()["chamado"]["numero"]
    assumido = client.post(f"/api/chamados/{numero}/assumir", headers=auth(carlos)).get_json()
    assert assumido["status"] == "Em atendimento" and assumido["analista"] == "Carlos Souza"
    curta = client.post(f"/api/chamados/{numero}/resolver", headers=auth(carlos), json={"nota": "ok"})
    assert curta.status_code == 422
    feito = client.post(f"/api/chamados/{numero}/resolver", headers=auth(carlos), json={"nota": "Troquei a fonte e testei."})
    assert feito.get_json()["status"] == "Resolvido"


def test_so_quem_assumiu_carimba(client, maria, carlos):
    numero = abrir(client, maria).get_json()["chamado"]["numero"]
    client.post(f"/api/chamados/{numero}/assumir", headers=auth(carlos))
    beatriz = token(client, "beatriz@helpia.com.br")
    resposta = client.post(f"/api/chamados/{numero}/resolver", headers=auth(beatriz), json={"nota": "Resolvido por outra pessoa."})
    assert resposta.status_code == 403


def test_carimbar_encerra_a_conversa_com_o_colaborador(client, maria, carlos):
    numero = abrir(client, maria).get_json()["chamado"]["numero"]
    client.post(f"/api/chamados/{numero}/assumir", headers=auth(carlos))
    contatos = client.get("/api/chat/contatos", headers=auth(carlos)).get_json()
    id_maria = next(p["id"] for p in contatos if p["nome"] == "Maria Oliveira")
    conversa = client.post("/api/chat/conversas", headers=auth(carlos), json={"com": id_maria, "ticket": numero}).get_json()
    # A Maria tem outro ticket em aberto com o Carlos? Carimba todos para a conversa encerrar
    abertos = [c for c in client.get("/api/chamados", headers=auth(carlos)).get_json()
               if c["solicitante"] == "Maria Oliveira" and c["status"] != "Resolvido"]
    for c in abertos:
        if c["status"] == "Aguardando":
            client.post(f"/api/chamados/{c['numero']}/assumir", headers=auth(carlos))
        if c["status"] != "Resolvido" and (c["analista"] in (None, "Carlos Souza")):
            client.post(f"/api/chamados/{c['numero']}/resolver", headers=auth(carlos), json={"nota": "Resolvido no teste automático."})
    conversas = client.get("/api/chat/conversas", headers=auth(carlos)).get_json()
    assert next(c for c in conversas if c["id"] == conversa["id"])["encerrada"] is True
    envio = client.post(f"/api/chat/conversas/{conversa['id']}/mensagens", headers=auth(carlos), json={"texto": "oi"})
    assert envio.status_code == 409


def test_colaborador_tira_ticket_da_mesa_mas_ele_fica_no_historico(client, maria):
    resolvido = next(c for c in client.get("/api/chamados", headers=auth(maria)).get_json() if c["status"] == "Resolvido")
    assert client.post(f"/api/chamados/{resolvido['numero']}/ocultar", headers=auth(maria)).get_json()["oculto_mesa"] is True
    assert any(c["numero"] == resolvido["numero"] for c in client.get("/api/chamados", headers=auth(maria)).get_json())


# ---------- Gestor ----------

def test_gestor_troca_prioridade_passa_e_exclui(client, gestor, maria):
    numero = abrir(client, maria).get_json()["chamado"]["numero"]
    alta = client.patch(f"/api/chamados/{numero}", headers=auth(gestor), json={"nivel": "alta"}).get_json()
    assert alta["nivel_manual"] == "alta" and alta["prioridade"] == "Alta"
    contatos = client.get("/api/chat/contatos", headers=auth(gestor)).get_json()
    id_carlos = next(p["id"] for p in contatos if p["nome"] == "Carlos Souza")
    passado = client.post(f"/api/chamados/{numero}/atribuir", headers=auth(gestor), json={"analista_id": id_carlos}).get_json()
    assert passado["analista"] == "Carlos Souza" and passado["status"] == "Em atendimento"
    assert client.delete(f"/api/chamados/{numero}", headers=auth(gestor)).status_code == 200


def test_analista_nao_troca_prioridade(client, carlos, maria):
    numero = abrir(client, maria).get_json()["chamado"]["numero"]
    assert client.patch(f"/api/chamados/{numero}", headers=auth(carlos), json={"nivel": "alta"}).status_code == 403


def test_modo_simulacao_e_limpar_dados(client, gestor):
    assert client.get("/api/simulacao", headers=auth(gestor)).get_json()["ativo"] is True
    client.post("/api/simulacao", headers=auth(gestor), json={"ativo": False})
    assert client.get("/api/chamados", headers=auth(gestor)).get_json() == []
    client.post("/api/simulacao", headers=auth(gestor), json={"ativo": True})
    assert len(client.get("/api/chamados", headers=auth(gestor)).get_json()) == 7
    client.post("/api/simulacao/limpar", headers=auth(gestor))
    assert client.get("/api/chamados", headers=auth(gestor)).get_json() == []
    assert client.get("/api/simulacao", headers=auth(gestor)).get_json()["ativo"] is False


# ---------- HelpIA Chat ----------

def test_grupo_responder_e_clear(client, gestor, carlos):
    grupo = next(c for c in client.get("/api/chat/conversas", headers=auth(carlos)).get_json() if c["tipo"] == "grupo")
    primeira = client.get(f"/api/chat/conversas/{grupo['id']}/mensagens", headers=auth(carlos)).get_json()[0]
    resposta = client.post(f"/api/chat/conversas/{grupo['id']}/mensagens", headers=auth(carlos),
                           json={"texto": "@Murilo do Nascimento B. combinado!", "resposta": primeira["id"]}).get_json()
    assert resposta["resposta"]["id"] == primeira["id"]
    assert client.delete(f"/api/chat/conversas/{grupo['id']}/mensagens", headers=auth(carlos)).status_code == 403
    assert client.delete(f"/api/chat/conversas/{grupo['id']}/mensagens", headers=auth(gestor)).status_code == 200
    restantes = client.get(f"/api/chat/conversas/{grupo['id']}/mensagens", headers=auth(gestor)).get_json()
    assert len(restantes) == 1 and "limpou a conversa" in restantes[0]["texto"]


def test_colaborador_nao_inicia_conversa(client, maria):
    assert client.post("/api/chat/conversas", headers=auth(maria), json={"com": 1}).status_code == 403


def test_tirar_ticket_do_assunto(client, carlos):
    direta = next(c for c in client.get("/api/chat/conversas", headers=auth(carlos)).get_json() if c["ticket"])
    resposta = client.patch(f"/api/chat/conversas/{direta['id']}", headers=auth(carlos), json={"ticket": None})
    assert resposta.get_json()["ticket"] is None


def test_anexo_sobe_e_so_a_empresa_baixa(client, maria, carlos):
    from io import BytesIO
    enviado = client.post("/api/anexos", headers=auth(maria),
                          data={"arquivo": (BytesIO(b"foto de teste"), "foto.jpg", "image/jpeg")},
                          content_type="multipart/form-data")
    assert enviado.status_code == 201
    meta = enviado.get_json()
    assert meta["nome"] == "foto.jpg" and meta["tamanho"] == 13
    baixado = client.get(f"/api/anexos/{meta['id']}", headers=auth(carlos))
    assert baixado.status_code == 200 and baixado.data == b"foto de teste"
    assert client.get(f"/api/anexos/{meta['id']}").status_code == 401


# ---------- Metas ----------

def test_metas_do_gestor(client, gestor, carlos, maria):
    salvo = client.patch("/api/metas", headers=auth(gestor), json={"meta_padrao": 8, "regra_do_dia": "Alta primeiro."}).get_json()
    assert salvo["meta_padrao"] == 8 and salvo["regra_do_dia"]["texto"] == "Alta primeiro."
    assert client.patch("/api/metas", headers=auth(gestor), json={"meta_padrao": 0}).status_code == 422
    assert client.get("/api/metas", headers=auth(carlos)).get_json()["minha_meta"] == 8
    assert client.get("/api/metas", headers=auth(maria)).status_code == 403
    com_frase = client.post("/api/metas/motivacionais", headers=auth(gestor), json={"texto": "Bora, time!"}).get_json()
    assert com_frase["motivacionais"][-1]["texto"] == "Bora, time!"
