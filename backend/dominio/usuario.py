"""Camada de Domínio — usuários do portal, empresas clientes e planos.

Perfis:
- colaborador: abre chamados pelo HelpBot e acompanha o andamento.
- analista: atende a fila de chamados no painel.
- gestor: responsável pela empresa contratante; acessa o painel e cria as
  contas de analistas e colaboradores (dentro do limite do plano).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

COLABORADOR = "colaborador"
ANALISTA = "analista"
GESTOR = "gestor"
PERFIS = (COLABORADOR, ANALISTA, GESTOR)
PERFIS_CRIAVEIS = (COLABORADOR, ANALISTA)   # o gestor cria contas destes perfis

MIN_SENHA = 6
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Valores ilustrativos (projeto acadêmico). None = sem limite / sob consulta.
PLANOS = {
    "essencial":    {"nome": "Essencial",    "preco_mensal": 149,  "limite_analistas": 3},
    "profissional": {"nome": "Profissional", "preco_mensal": 390,  "limite_analistas": 15},
    "empresarial":  {"nome": "Empresarial",  "preco_mensal": None, "limite_analistas": None},
}


class DadosInvalidos(ValueError):
    """Dados de cadastro ou de login fora das regras."""


def agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def validar_nome(nome: str, campo: str = "Nome") -> str:
    nome = " ".join((nome or "").split())
    if len(nome) < 2:
        raise DadosInvalidos(f"{campo} deve ter pelo menos 2 caracteres.")
    return nome[:80]


def validar_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not _EMAIL.match(email):
        raise DadosInvalidos("Informe um e-mail válido.")
    return email


def validar_senha(senha: str) -> str:
    if len(senha or "") < MIN_SENHA:
        raise DadosInvalidos(f"A senha deve ter pelo menos {MIN_SENHA} caracteres.")
    return senha


def validar_plano(plano: str) -> str:
    plano = (plano or "").strip().lower()
    if plano not in PLANOS:
        raise DadosInvalidos("Escolha um dos planos disponíveis.")
    return plano


@dataclass
class Empresa:
    id: int
    nome: str
    plano: str
    cnpj: str = ""
    criada_em: str = field(default_factory=agora)

    @property
    def limite_analistas(self) -> int | None:
        return PLANOS[self.plano]["limite_analistas"]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nome": self.nome,
            "plano": self.plano,
            "plano_nome": PLANOS[self.plano]["nome"],
            "limite_analistas": self.limite_analistas,
        }


@dataclass
class Usuario:
    id: int
    nome: str
    email: str
    perfil: str
    empresa_id: int
    senha_hash: str = field(repr=False)
    criado_em: str = field(default_factory=agora)

    @classmethod
    def criar(cls, id: int, nome: str, email: str, perfil: str, empresa_id: int, senha: str) -> "Usuario":
        if perfil not in PERFIS:
            raise DadosInvalidos("Perfil inválido.")
        return cls(
            id=id,
            nome=validar_nome(nome),
            email=validar_email(email),
            perfil=perfil,
            empresa_id=empresa_id,
            senha_hash=generate_password_hash(validar_senha(senha)),
        )

    def confere_senha(self, senha: str) -> bool:
        return check_password_hash(self.senha_hash, senha or "")

    @property
    def acessa_painel(self) -> bool:
        return self.perfil in (ANALISTA, GESTOR)

    @property
    def pode_criar_contas(self) -> bool:
        return self.perfil == GESTOR

    def entra_como(self, area: str) -> bool:
        """A tela de login tem duas áreas: 'colaborador' e 'analista'.
        O gestor entra pela área do analista."""
        if area == COLABORADOR:
            return self.perfil == COLABORADOR
        if area == ANALISTA:
            return self.acessa_painel
        return False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nome": self.nome,
            "email": self.email,
            "perfil": self.perfil,
            "empresa_id": self.empresa_id,
            "criado_em": self.criado_em,
        }
