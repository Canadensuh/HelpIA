"""Camada de Domínio — empresas clientes, planos e usuários.

Perfis:
- colaborador: abre chamados com o Helpy e acompanha o andamento.
- analista: atende a fila na mesa de atendimento.
- gestor: responsável pela empresa; acompanha o painel, define metas e
  emite os crachás (contas) da equipe, dentro do limite do plano.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from werkzeug.security import check_password_hash, generate_password_hash

from backend.dominio.erros import DadosInvalidos
from backend.dominio.relogio import agora

COLABORADOR = "colaborador"
ANALISTA = "analista"
GESTOR = "gestor"
PERFIS = (COLABORADOR, ANALISTA, GESTOR)
PERFIS_CRIAVEIS = (COLABORADOR, ANALISTA, GESTOR)   # o gestor também pode nomear outro gestor

MIN_SENHA = 6
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Valores ilustrativos (projeto acadêmico). None = sem limite / sob consulta.
PLANOS = {
    "essencial":    {"nome": "Essencial",    "preco_mensal": 149,  "limite_analistas": 3},
    "profissional": {"nome": "Profissional", "preco_mensal": 390,  "limite_analistas": 15},
    "empresarial":  {"nome": "Empresarial",  "preco_mensal": None, "limite_analistas": None},
}


def validar_nome(nome: str, campo: str = "Nome") -> str:
    nome = " ".join(str(nome or "").split())
    if len(nome) < 2:
        raise DadosInvalidos(f"{campo} deve ter pelo menos 2 caracteres.")
    return nome[:80]


def validar_email(email: str) -> str:
    email = str(email or "").strip().lower()
    if not _EMAIL.match(email):
        raise DadosInvalidos("Informe um e-mail válido.")
    return email


def validar_senha(senha: str) -> str:
    if len(senha or "") < MIN_SENHA:
        raise DadosInvalidos(f"A senha deve ter pelo menos {MIN_SENHA} caracteres.")
    return senha


def validar_plano(plano: str) -> str:
    plano = str(plano or "").strip().lower()
    if plano not in PLANOS:
        raise DadosInvalidos("Escolha um dos planos disponíveis.")
    return plano


def chave_email(email: str) -> str:
    """E-mail comparado sem caixa e sem acento: "JoãoPM@…" e "joaopm@…" são a mesma conta."""
    texto = unicodedata.normalize("NFD", str(email or "").strip().lower())
    return "".join(c for c in texto if not unicodedata.combining(c))


@dataclass
class Empresa:
    id: int
    nome: str
    plano: str
    cnpj: str = ""
    simulacao: bool = False          # Modo simulação ligado pelo gestor
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
    ativo: bool = True
    foto: str | None = None          # URL https (ex.: foto do GitHub); sem foto, o front mostra o ícone do cargo
    trocar_senha: bool = False
    criado_em: str = field(default_factory=agora)

    @classmethod
    def criar(cls, id: int, nome: str, email: str, perfil: str, empresa_id: int,
              senha: str, criado_em: str | None = None) -> "Usuario":
        if perfil not in PERFIS:
            raise DadosInvalidos("Perfil inválido.")
        return cls(
            id=id,
            nome=validar_nome(nome),
            email=validar_email(email),
            perfil=perfil,
            empresa_id=empresa_id,
            senha_hash=generate_password_hash(validar_senha(senha)),
            criado_em=criado_em or agora(),
        )

    def definir_senha(self, senha: str) -> None:
        self.senha_hash = generate_password_hash(senha)

    def confere_senha(self, senha: str) -> bool:
        return check_password_hash(self.senha_hash, senha or "")

    @property
    def eh_equipe(self) -> bool:
        """Analistas e gestores: a equipe de TI."""
        return self.perfil in (ANALISTA, GESTOR)

    def entra_como(self, area: str) -> bool:
        """A tela de login tem as áreas 'colaborador' e 'analista'; o gestor entra pela do analista."""
        if area == COLABORADOR:
            return self.perfil == COLABORADOR
        if area == ANALISTA:
            return self.eh_equipe
        return False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nome": self.nome,
            "email": self.email,
            "perfil": self.perfil,
            "empresa_id": self.empresa_id,
            "ativo": self.ativo,
            "criado_em": self.criado_em,
            "trocar_senha": self.trocar_senha,
            "foto": self.foto,
        }

    def resumo(self) -> dict:
        """Como a pessoa aparece no chat (participantes)."""
        return {"id": self.id, "nome": self.nome, "perfil": self.perfil, "foto": self.foto}
