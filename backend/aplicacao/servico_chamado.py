"""Camada de Aplicação — coordena a jornada de abertura e atendimento."""
from __future__ import annotations

from backend.dominio.chamado import (
    STATUS_VALIDOS,
    Chamado,
    classificar,
    validar_descricao,
)
from backend.persistencia.repositorio_chamado import RepositorioChamadoMemoria


class ChamadoNaoEncontrado(LookupError):
    pass


class ServicoChamado:
    def __init__(self, repositorio: RepositorioChamadoMemoria) -> None:
        self.repo = repositorio

    def abrir(self, descricao: str, solicitante: str) -> Chamado:
        descricao = validar_descricao(descricao)              # RN-01
        categoria, fila, prioridade = classificar(descricao)  # CA-02
        chamado = Chamado(                                    # CA-01
            numero=self.repo.proximo_numero(),
            descricao=descricao,
            solicitante=(solicitante or "").strip() or "Colaborador",
            categoria=categoria,
            fila=fila,
            prioridade=prioridade,
        )
        return self.repo.salvar(chamado)

    def listar(self, status: str | None = None, solicitante: str | None = None) -> list[Chamado]:
        chamados = self.repo.listar()
        if status in STATUS_VALIDOS:
            chamados = [c for c in chamados if c.status == status]
        if solicitante:
            alvo = solicitante.strip().lower()
            chamados = [c for c in chamados if c.solicitante.lower() == alvo]
        return chamados

    def obter(self, numero: int) -> Chamado:
        chamado = self.repo.buscar(numero)
        if chamado is None:
            raise ChamadoNaoEncontrado(f"Chamado #{numero:03d} não encontrado.")
        return chamado

    def assumir(self, numero: int, analista: str) -> Chamado:
        chamado = self.obter(numero)
        chamado.assumir((analista or "").strip() or "Analista")
        return self.repo.salvar(chamado)

    def resolver(self, numero: int) -> Chamado:
        chamado = self.obter(numero)
        chamado.resolver()
        return self.repo.salvar(chamado)

    def popular_exemplos(self) -> None:
        """Chamados de exemplo para a demonstração (os mesmos do protótipo)."""
        self.abrir("Meu computador não liga desde hoje cedo", "João Silva")
        self.abrir("Estou sem acesso à rede, o setor todo está parado", "Maria Oliveira")
