"""Camada de Persistência — os dados do HelpIA em memória.

Para a apresentação os dados ficam em memória: o servidor sobe com as
contas e os tickets de demonstração e volta ao estado inicial quando
reinicia (no plano gratuito do Render, ele dorme e reinicia sozinho).

Trocar por um banco de verdade (PostgreSQL/SQLAlchemy) só exige uma nova
classe com os mesmos atributos e métodos.
"""
from __future__ import annotations

from backend.dominio.chamado import Chamado
from backend.dominio.chat import Conversa, Mensagem, Metas
from backend.dominio.usuario import Empresa, Usuario, chave_email


class BancoMemoria:
    def __init__(self) -> None:
        self.empresas: dict[int, Empresa] = {}
        self.usuarios: dict[int, Usuario] = {}
        self.chamados: dict[int, Chamado] = {}
        self.conversas: dict[int, Conversa] = {}
        self.mensagens: list[Mensagem] = []
        self.leituras: dict[tuple[int, int], int] = {}   # (conversa, usuário) → última mensagem lida
        self.metas: dict[int, Metas] = {}                # por empresa
        self.anexos: dict[str, dict] = {}                # id → { empresa_id, nome, tipo, tamanho, dados }
        self._contadores = {"empresa": 1, "usuario": 1, "chamado": 1, "conversa": 1, "mensagem": 1}

    def proximo(self, tipo: str) -> int:
        numero = self._contadores[tipo]
        self._contadores[tipo] += 1
        return numero

    # ---------- Usuários ----------
    def buscar_por_email(self, email: str) -> Usuario | None:
        alvo = chave_email(email)
        return next((u for u in self.usuarios.values() if chave_email(u.email) == alvo), None)

    def usuarios_da_empresa(self, empresa_id: int) -> list[Usuario]:
        return sorted((u for u in self.usuarios.values() if u.empresa_id == empresa_id), key=lambda u: u.id)

    def usuario_por_nome(self, nome: str | None, empresa_id: int | None = None) -> Usuario | None:
        return next((u for u in self.usuarios.values()
                     if u.nome == nome and (empresa_id is None or u.empresa_id == empresa_id)), None)

    # ---------- Chamados ----------
    def empresa_do_chamado(self, chamado: Chamado) -> int | None:
        """Os tickets guardam a empresa; os antigos, sem ela, herdam a do solicitante."""
        if chamado.empresa_id:
            return chamado.empresa_id
        dono = self.usuarios.get(chamado.solicitante_id) if chamado.solicitante_id is not None else None
        if dono:
            return dono.empresa_id
        return next(iter(self.empresas)) if len(self.empresas) == 1 else None

    def chamados_da_empresa(self, empresa_id: int) -> list[Chamado]:
        return sorted((c for c in self.chamados.values() if self.empresa_do_chamado(c) == empresa_id),
                      key=lambda c: c.numero)

    # ---------- Chat ----------
    def mensagens_da_conversa(self, conversa_id: int) -> list[Mensagem]:
        return [m for m in self.mensagens if m.conversa_id == conversa_id]
