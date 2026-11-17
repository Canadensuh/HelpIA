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


# ---------- Planos e contratação ----------

def test_lista_planos(client):
    planos = {p["id"] for p in client.get("/api/planos").get_json()}
    assert planos == {"essencial", "profissional", "empresarial"}


def test_contratar_cria_empresa_e_gestor_logado(client):
    resposta = contratar(client)
    assert resposta.status_code == 201
    dados = resposta.get_json()
    assert dados["token"]
    assert dados["usuario"]["perfil"] == "gestor"
    assert dados["usuario"]["empresa"]["plano"] == "essencial"
    assert "senha_hash" not in dados["usuario"]


def test_contratar_plano_inexistente(client):
    assert contratar(client, plano="ouro").status_code == 422


def test_contratar_senha_curta_nao_cria_empresa(client):
    assert contratar(client, senha="123").status_code == 422
    # O e-mail continua livre: nada ficou gravado pela tentativa anterior
    assert contratar(client).status_code == 201


def test_contratar_email_repetido(client):
    contratar(client)
    assert contratar(client).status_code == 409


# ---------- Login por área ----------

def test_login_analista_e_colaborador(client, token_gestor):
    criar(client, token_gestor, "Carlos", "carlos@acme.com", "analista")
    criar(client, token_gestor, "João", "joao@acme.com", "colaborador")

    analista = client.post("/api/auth/login", json={"email": "carlos@acme.com", "senha": "segredo1", "perfil": "analista"})
    assert analista.status_code == 200
    assert analista.get_json()["usuario"]["perfil"] == "analista"

    colaborador = client.post("/api/auth/login", json={"email": "JOAO@acme.com ", "senha": "segredo1", "perfil": "colaborador"})
    assert colaborador.status_code == 200
    assert colaborador.get_json()["usuario"]["perfil"] == "colaborador"


def test_login_area_errada_e_negado(client, token_gestor):
    criar(client, token_gestor, "João", "joao@acme.com", "colaborador")
    resposta = client.post("/api/auth/login", json={"email": "joao@acme.com", "senha": "segredo1", "perfil": "analista"})
    assert resposta.status_code == 403
    assert "Colaborador" in resposta.get_json()["erro"]


def test_gestor_entra_pela_area_do_analista(client, token_gestor):
    resposta = client.post("/api/auth/login", json={"email": "gestor@acme.com", "senha": "segredo1", "perfil": "analista"})
    assert resposta.status_code == 200


def test_login_senha_errada(client, token_gestor):
    resposta = client.post("/api/auth/login", json={"email": "gestor@acme.com", "senha": "errada", "perfil": "analista"})
    assert resposta.status_code == 401


def test_eu_com_e_sem_token(client, token_gestor):
    assert client.get("/api/auth/eu").status_code == 401
    assert client.get("/api/auth/eu", headers=auth("token-falso")).status_code == 401
    assert client.get("/api/auth/eu", headers=auth(token_gestor)).get_json()["nome"] == "Gina Gestora"


# ---------- Criação de contas (somente gestor) ----------

def test_gestor_cria_e_lista_contas(client, token_gestor):
    assert criar(client, token_gestor, "Carlos", "carlos@acme.com", "analista").status_code == 201
    contas = client.get("/api/contas", headers=auth(token_gestor)).get_json()
    assert [c["perfil"] for c in contas] == ["gestor", "analista"]


def test_analista_nao_cria_contas(client, token_gestor):
    criar(client, token_gestor, "Carlos", "carlos@acme.com", "analista")
    token = client.post("/api/auth/login", json={"email": "carlos@acme.com", "senha": "segredo1"}).get_json()["token"]
    assert criar(client, token, "Bia", "bia@acme.com", "analista").status_code == 403


def test_gestor_nao_cria_outro_gestor(client, token_gestor):
    assert criar(client, token_gestor, "Outro", "outro@acme.com", "gestor").status_code == 422


def test_limite_de_analistas_do_plano(client, token_gestor):
    for i in range(3):   # Essencial: até 3 analistas
        assert criar(client, token_gestor, f"Analista {i}", f"a{i}@acme.com", "analista").status_code == 201
    assert criar(client, token_gestor, "Quarto", "a4@acme.com", "analista").status_code == 409
    # Colaboradores não contam no limite de analistas
    assert criar(client, token_gestor, "João", "joao@acme.com", "colaborador").status_code == 201


def test_contas_de_demonstracao():
    client = criar_app(com_exemplos=True, chave_secreta="teste").test_client()
    for email, area in [("gestor@demo.helpia", "analista"),
                        ("analista@demo.helpia", "analista"),
                        ("colaborador@demo.helpia", "colaborador")]:
        resposta = client.post("/api/auth/login", json={"email": email, "senha": "demo123", "perfil": area})
        assert resposta.status_code == 200, email
