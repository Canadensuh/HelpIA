"""Camada de Aplicação — anexos do HelpIA Chat (prints, fotos da câmera, documentos…).

O arquivo é enviado antes da mensagem (POST /api/anexos) e a mensagem
guarda só { id, nome, tipo, tamanho }. Só as pessoas da mesma empresa
baixam o anexo. Ficam em memória, como o resto dos dados: há um teto
total e os mais antigos saem primeiro quando ele é atingido.
"""
from __future__ import annotations

import secrets

from backend.dominio.erros import DadosInvalidos, NaoEncontrado
from backend.dominio.usuario import Usuario
from backend.persistencia.banco import BancoMemoria

LIMITE_ARQUIVO = 25 * 1024 * 1024        # 25 MB por arquivo (o mesmo do frontend)
LIMITE_TOTAL = 200 * 1024 * 1024         # teto na memória do servidor


class ServicoAnexos:
    def __init__(self, banco: BancoMemoria) -> None:
        self.banco = banco

    def salvar(self, usuario: Usuario, nome: str, tipo: str, dados: bytes) -> dict:
        if not dados:
            raise DadosInvalidos("O arquivo está vazio.")
        if len(dados) > LIMITE_ARQUIVO:
            raise DadosInvalidos("O arquivo passa de 25 MB.")
        self._abrir_espaco(len(dados))
        id_anexo = f"a{secrets.token_hex(8)}"
        meta = {"id": id_anexo, "nome": (nome or "arquivo")[:200],
                "tipo": (tipo or "application/octet-stream")[:100], "tamanho": len(dados)}
        self.banco.anexos[id_anexo] = {**meta, "empresa_id": usuario.empresa_id, "dados": dados}
        return meta

    def obter(self, usuario: Usuario, id_anexo: str) -> dict:
        anexo = self.banco.anexos.get(id_anexo)
        if anexo is None or anexo["empresa_id"] != usuario.empresa_id:
            raise NaoEncontrado("Anexo não encontrado.")
        return anexo

    def _abrir_espaco(self, tamanho: int) -> None:
        total = sum(a["tamanho"] for a in self.banco.anexos.values())
        for id_antigo in list(self.banco.anexos):          # os dicionários guardam a ordem de chegada
            if total + tamanho <= LIMITE_TOTAL:
                break
            total -= self.banco.anexos.pop(id_antigo)["tamanho"]
