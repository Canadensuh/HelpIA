import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app import criar_app
from backend.dominio.chamado import DescricaoInsuficiente, classificar, validar_descricao


@pytest.fixture
def client():
    return criar_app(com_exemplos=False).test_client()


def abrir(client, descricao, solicitante="Ana"):
    return client.post("/api/chamados", json={"descricao": descricao, "solicitante": solicitante})


# ---------- Domínio ----------

def test_classifica_hardware():
    assert classificar("Meu computador não liga") == ("Hardware", "Suporte Técnico", "Normal")


def test_classifica_rede_com_prioridade_alta():
    categoria, fila, prioridade = classificar("Sem conexão com a internet, setor parado")
    assert (categoria, fila, prioridade) == ("Rede", "Infraestrutura", "Alta")


def test_classifica_categoria_padrao():
    assert classificar("Preciso de uma cadeira nova")[:2] == ("Geral", "Service Desk")


def test_rn01_descricao_curta_e_rejeitada():
    with pytest.raises(DescricaoInsuficiente):
        validar_descricao("ajuda")


# ---------- API ----------

def test_status(client):
    resposta = client.get("/api/status")
    assert resposta.status_code == 200
    assert resposta.get_json()["sistema"] == "HelpIA"


def test_pagina_inicial(client):
    assert client.get("/").status_code == 200


def test_ca01_ca03_abrir_chamado(client):
    resposta = abrir(client, "Meu computador não liga desde ontem")
    assert resposta.status_code == 201
    dados = resposta.get_json()
    chamado = dados["chamado"]
    assert chamado["numero"] == 1
    assert chamado["codigo"] == "#001"
    assert chamado["aberto_em"]
    assert chamado["status"] == "Aguardando"
    assert "#001" in dados["mensagem"]


def test_ca01_numeros_unicos(client):
    a = abrir(client, "Minha senha do sistema expirou").get_json()["chamado"]
    b = abrir(client, "A impressora do setor não imprime").get_json()["chamado"]
    assert a["numero"] != b["numero"]


def test_ca02_chamado_vai_para_fila_correta(client):
    chamado = abrir(client, "Não consigo fazer login, senha bloqueada").get_json()["chamado"]
    assert chamado["categoria"] == "Acesso"
    assert chamado["fila"] == "Acessos e Identidade"


def test_rn01_api_pede_complemento(client):
    resposta = abrir(client, "socorro")
    assert resposta.status_code == 422
    assert resposta.get_json()["precisa_complemento"] is True
    assert client.get("/api/chamados").get_json() == []


def test_fluxo_assumir_e_resolver(client):
    abrir(client, "Meu computador não liga desde ontem")

    assumido = client.post("/api/chamados/1/assumir", json={"analista": "Carlos"}).get_json()
    assert assumido["status"] == "Em atendimento"
    assert assumido["analista"] == "Carlos"

    resolvido = client.post("/api/chamados/1/resolver").get_json()
    assert resolvido["status"] == "Resolvido"


def test_nao_assume_chamado_duas_vezes(client):
    abrir(client, "Meu computador não liga desde ontem")
    client.post("/api/chamados/1/assumir", json={"analista": "Carlos"})
    assert client.post("/api/chamados/1/assumir", json={"analista": "Bia"}).status_code == 409


def test_filtros_da_listagem(client):
    abrir(client, "Meu computador não liga desde ontem", "Ana")
    abrir(client, "Excel travando ao abrir planilha", "Bruno")
    client.post("/api/chamados/1/assumir", json={"analista": "Carlos"})

    assert len(client.get("/api/chamados?status=Aguardando").get_json()) == 1
    assert len(client.get("/api/chamados?solicitante=bruno").get_json()) == 1


def test_chamado_inexistente(client):
    assert client.get("/api/chamados/99").status_code == 404
