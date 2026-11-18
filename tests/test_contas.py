import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app import criar_app


@pytest.fixture
def client():
    return criar_app(com_exemplos=False, chave_secreta="teste").test_client()


def contratar(client, plano="essencial", email="gestor@acme.com", senha="segredo1"):
    return client.post("/api/empresas", json={
        "plano": plano,
        "empresa": {"nome": "Acme Ltda", "cnpj": "00.000.000/0001-00"},
        "responsavel": {"nome": "Gina Gestora", "email": email, "senha": senha},
    })


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def token_gestor(client):
    return contratar(client).get_json()["token"]


def criar(client, token, nome, email, perfil, senha="segredo1"):
    return client.post("/api/contas", headers=auth(token),
                       json={"nome": nome, "email": email, "perfil": perfil, "senha": senha})


def entrar(client, email, senha="segredo1", perfil=None):
    return client.post("/api/auth/login", json={"email": email, "senha": senha, "perfil": perfil})


# ---------- Planos e contratação ----------

def test_lista_planos(client):
    planos = {p["id"]: p for p in client.get("/api/planos").get_json()}
    assert set(planos) == {"essencial", "profissional", "empresarial"}
    assert planos["essencial"]["limite_analistas"] == 3


def test_contratar_cria_empresa_e_gestor_logado(client):
    resposta = contratar(client)
    assert resposta.status_code == 201
    sessao = resposta.get_json()
    assert sessao["usuario"]["perfil"] == "gestor"
    assert sessao["usuario"]["empresa"]["nome"] == "Acme Ltda"
    assert client.get("/api/auth/eu", headers=auth(sessao["token"])).status_code == 200


def test_contratar_email_repetido_da_conflito(client):
    contratar(client)
    assert contratar(client).status_code == 409


def test_contratar_senha_curta(client):
    assert contratar(client, senha="123").status_code == 422


# ---------- Login ----------

def test_login_e_senha_errada(client):
    contratar(client)
    assert entrar(client, "gestor@acme.com").status_code == 200
    assert entrar(client, "gestor@acme.com", "errada1").status_code == 401


def test_email_sem_caixa_e_sem_acento(client, token_gestor):
    criar(client, token_gestor, "João Pedro", "JoãoPM@acme.com", "analista")
    assert entrar(client, "joaopm@ACME.com").status_code == 200


def test_gestor_entra_pela_area_do_analista(client):
    contratar(client)
    assert entrar(client, "gestor@acme.com", perfil="analista").status_code == 200
    assert entrar(client, "gestor@acme.com", perfil="colaborador").status_code == 403


def test_sem_token_da_401(client):
    assert client.get("/api/chamados").status_code == 401


# ---------- Contas da equipe ----------

def test_gestor_emite_crachas(client, token_gestor):
    assert criar(client, token_gestor, "Carlos", "carlos@acme.com", "analista").status_code == 201
    assert criar(client, token_gestor, "Ana", "ana@acme.com", "colaborador").status_code == 201
    assert criar(client, token_gestor, "Gil", "gil@acme.com", "gestor").status_code == 201
    contas = client.get("/api/contas", headers=auth(token_gestor)).get_json()
    assert [c["perfil"] for c in contas] == ["gestor", "analista", "colaborador", "gestor"]


def test_limite_de_analistas_do_plano(client, token_gestor):
    for i in range(3):
        assert criar(client, token_gestor, f"Analista {i}", f"a{i}@acme.com", "analista").status_code == 201
    assert criar(client, token_gestor, "Quarto", "a4@acme.com", "analista").status_code == 409


def test_colaborador_nao_cria_contas(client, token_gestor):
    criar(client, token_gestor, "Ana", "ana@acme.com", "colaborador")
    token = entrar(client, "ana@acme.com").get_json()["token"]
    assert criar(client, token, "Beto", "beto@acme.com", "colaborador").status_code == 403


def test_suspender_derruba_a_sessao(client, token_gestor):
    conta = criar(client, token_gestor, "Ana", "ana@acme.com", "colaborador").get_json()
    token = entrar(client, "ana@acme.com").get_json()["token"]
    resposta = client.patch(f"/api/contas/{conta['id']}", headers=auth(token_gestor), json={"ativo": False})
    assert resposta.get_json()["ativo"] is False
    assert client.get("/api/auth/eu", headers=auth(token)).status_code == 401
    assert entrar(client, "ana@acme.com").status_code == 403


def test_trocar_cargo_e_redefinir_senha(client, token_gestor):
    conta = criar(client, token_gestor, "Ana", "ana@acme.com", "colaborador").get_json()
    resposta = client.patch(f"/api/contas/{conta['id']}", headers=auth(token_gestor), json={"perfil": "analista"})
    assert resposta.get_json()["perfil"] == "analista"
    client.post(f"/api/contas/{conta['id']}/senha", headers=auth(token_gestor), json={"senha": "novasenha"})
    assert entrar(client, "ana@acme.com", "novasenha").status_code == 200


def test_gestor_nao_altera_a_propria_conta(client, token_gestor):
    eu = client.get("/api/auth/eu", headers=auth(token_gestor)).get_json()
    assert client.patch(f"/api/contas/{eu['id']}", headers=auth(token_gestor), json={"ativo": False}).status_code == 422


def test_trocar_a_propria_senha(client, token_gestor):
    errada = client.post("/api/auth/senha", headers=auth(token_gestor), json={"atual": "xxxxxx", "nova": "outra123"})
    assert errada.status_code == 422
    certa = client.post("/api/auth/senha", headers=auth(token_gestor), json={"atual": "segredo1", "nova": "outra123"})
    assert certa.status_code == 200
    assert entrar(client, "gestor@acme.com", "outra123").status_code == 200
