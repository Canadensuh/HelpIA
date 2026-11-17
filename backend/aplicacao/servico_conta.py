"""Camada de Aplicação — contratação, login e criação de contas.

A sessão é um token assinado (itsdangerous, já instalado com o Flask) que
carrega apenas o id do usuário. O front envia o token no cabeçalho
`Authorization: Bearer <token>`.
"""
from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from backend.dominio.usuario import (
    ANALISTA,
    COLABORADOR,
    GESTOR,
    PERFIS_CRIAVEIS,
    DadosInvalidos,
    Empresa,
    Usuario,
    validar_email,
    validar_nome,
    validar_plano,
    validar_senha,
)
from backend.persistencia.repositorio_usuario import RepositorioUsuarioMemoria

VALIDADE_SESSAO = 12 * 60 * 60   # 12 horas, em segundos


class CredenciaisInvalidas(Exception):
    """Login ou sessão inválidos (HTTP 401)."""


class AcessoNegado(Exception):
    """Usuário autenticado, mas sem permissão para a ação (HTTP 403)."""


class EmailJaCadastrado(DadosInvalidos):
    """Já existe conta com este e-mail (HTTP 409)."""


class LimiteDoPlano(DadosInvalidos):
    """O plano da empresa não permite mais analistas (HTTP 409)."""


class ServicoConta:
    def __init__(self, repositorio: RepositorioUsuarioMemoria, chave_secreta: str) -> None:
        self.repo = repositorio
        self._assinador = URLSafeTimedSerializer(chave_secreta, salt="helpia-sessao")

    # ---------- Sessão ----------
    def emitir_sessao(self, usuario: Usuario) -> dict:
        return {"token": self._assinador.dumps({"uid": usuario.id}), "usuario": self.perfil_publico(usuario)}

    def perfil_publico(self, usuario: Usuario) -> dict:
        empresa = self.repo.buscar_empresa(usuario.empresa_id)
        return {**usuario.to_dict(), "empresa": empresa.to_dict() if empresa else None}

    def usuario_do_token(self, token: str) -> Usuario:
        try:
            dados = self._assinador.loads(token, max_age=VALIDADE_SESSAO)
        except SignatureExpired:
            raise CredenciaisInvalidas("Sua sessão expirou. Entre novamente.")
        except BadSignature:
            raise CredenciaisInvalidas("Sessão inválida. Entre novamente.")
        usuario = self.repo.buscar_usuario(dados.get("uid"))
        if usuario is None:
            raise CredenciaisInvalidas("Conta não encontrada. Entre novamente.")
        return usuario

    # ---------- Login ----------
    def autenticar(self, email: str, senha: str, area: str | None = None) -> dict:
        usuario = self.repo.buscar_por_email(email)
        if usuario is None or not usuario.confere_senha(senha):
            raise CredenciaisInvalidas("E-mail ou senha incorretos.")
        if area and not usuario.entra_como(area):
            certa = "Colaborador" if usuario.perfil == COLABORADOR else "Analista"
            raise AcessoNegado(f"Esta conta não é de {area}. Selecione “{certa}” para entrar.")
        return self.emitir_sessao(usuario)

    # ---------- Contratação ----------
    def contratar(self, plano: str, nome_empresa: str, cnpj: str,
                  nome_responsavel: str, email: str, senha: str) -> dict:
        """Cria a empresa e a conta do gestor responsável, já autenticado."""
        plano = validar_plano(plano)
        nome_empresa = validar_nome(nome_empresa, "Nome da empresa")
        # Valida o responsável antes de gravar, para não sobrar empresa sem gestor
        validar_nome(nome_responsavel, "Nome do responsável")
        validar_email(email)
        validar_senha(senha)
        self._garantir_email_livre(email)
        empresa = self.repo.salvar_empresa(Empresa(
            id=self.repo.proximo_id_empresa(),
            nome=nome_empresa,
            plano=plano,
            cnpj=(cnpj or "").strip()[:20],
        ))
        gestor = Usuario.criar(self.repo.proximo_id_usuario(), nome_responsavel, email,
                               GESTOR, empresa.id, senha)
        self.repo.salvar_usuario(gestor)
        return self.emitir_sessao(gestor)

    # ---------- Contas da equipe (somente gestor) ----------
    def criar_conta(self, gestor: Usuario, nome: str, email: str, perfil: str, senha: str) -> Usuario:
        self._exigir_gestor(gestor)
        if perfil not in PERFIS_CRIAVEIS:
            raise DadosInvalidos("O perfil deve ser analista ou colaborador.")
        self._garantir_email_livre(email)
        if perfil == ANALISTA:
            self._garantir_limite_analistas(gestor.empresa_id)
        usuario = Usuario.criar(self.repo.proximo_id_usuario(), nome, email, perfil,
                                gestor.empresa_id, senha)
        return self.repo.salvar_usuario(usuario)

    def listar_contas(self, gestor: Usuario) -> list[Usuario]:
        self._exigir_gestor(gestor)
        return self.repo.listar_usuarios(gestor.empresa_id)

    # ---------- Regras auxiliares ----------
    def _exigir_gestor(self, usuario: Usuario) -> None:
        if not usuario.pode_criar_contas:
            raise AcessoNegado("Somente o gestor da empresa pode gerenciar contas.")

    def _garantir_email_livre(self, email: str) -> None:
        if self.repo.buscar_por_email(email):
            raise EmailJaCadastrado("Já existe uma conta com este e-mail.")

    def _garantir_limite_analistas(self, empresa_id: int) -> None:
        empresa = self.repo.buscar_empresa(empresa_id)
        limite = empresa.limite_analistas if empresa else None
        if limite is None:
            return
        analistas = sum(1 for u in self.repo.listar_usuarios(empresa_id) if u.perfil == ANALISTA)
        if analistas >= limite:
            raise LimiteDoPlano(
                f"O plano {empresa.to_dict()['plano_nome']} permite até {limite} analistas."
            )

    def popular_exemplos(self) -> None:
        """Empresa e contas de demonstração (senha de todas: demo123)."""
        sessao = self.contratar("profissional", "Empresa Demonstração", "",
                                "Ana Lima", "gestor@demo.helpia", "demo123")
        gestor = self.repo.buscar_usuario(sessao["usuario"]["id"])
        self.criar_conta(gestor, "Carlos Souza", "analista@demo.helpia", ANALISTA, "demo123")
        self.criar_conta(gestor, "João Silva", "colaborador@demo.helpia", COLABORADOR, "demo123")
        self.criar_conta(gestor, "Maria Oliveira", "maria@demo.helpia", COLABORADOR, "demo123")
