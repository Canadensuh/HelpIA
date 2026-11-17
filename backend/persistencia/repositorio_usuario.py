"""Camada de Persistência — usuários e empresas (em memória, como os chamados)."""
from __future__ import annotations

from backend.dominio.usuario import Empresa, Usuario


class RepositorioUsuarioMemoria:
    def __init__(self) -> None:
        self._usuarios: dict[int, Usuario] = {}
        self._empresas: dict[int, Empresa] = {}
        self._proximo_usuario = 1
        self._proxima_empresa = 1

    # ---------- Usuários ----------
    def proximo_id_usuario(self) -> int:
        numero = self._proximo_usuario
        self._proximo_usuario += 1
        return numero

    def salvar_usuario(self, usuario: Usuario) -> Usuario:
        self._usuarios[usuario.id] = usuario
        return usuario

    def buscar_usuario(self, id: int) -> Usuario | None:
        return self._usuarios.get(id)

    def buscar_por_email(self, email: str) -> Usuario | None:
        alvo = (email or "").strip().lower()
        return next((u for u in self._usuarios.values() if u.email == alvo), None)

    def listar_usuarios(self, empresa_id: int) -> list[Usuario]:
        return sorted(
            (u for u in self._usuarios.values() if u.empresa_id == empresa_id),
            key=lambda u: u.id,
        )

    # ---------- Empresas ----------
    def proximo_id_empresa(self) -> int:
        numero = self._proxima_empresa
        self._proxima_empresa += 1
        return numero

    def salvar_empresa(self, empresa: Empresa) -> Empresa:
        self._empresas[empresa.id] = empresa
        return empresa

    def buscar_empresa(self, id: int) -> Empresa | None:
        return self._empresas.get(id)
