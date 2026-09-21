import type { Translation } from './en'

const pt: Translation = {
  languageLabel: 'Idioma',
  signIn: 'Entrar',
  createAccount: 'Criar conta',
  home: 'Início',
  email: 'E-mail',
  password: 'Senha',
  signingIn: 'Entrando…',
  invalidCredentials: 'E-mail ou senha inválidos.',
  invalidInput: 'Verifique as informações digitadas.',
  signInUnavailable: 'Não foi possível entrar agora. Tente novamente.',
  name: 'Nome',
  creatingAccount: 'Criando conta…',
  emailAlreadyExists: 'Já existe uma conta com este e-mail.',
  registrationUnavailable:
    'Não foi possível criar sua conta agora. Tente novamente.',
  accountCreatedSessionFailed:
    'Sua conta foi criada, mas não foi possível iniciar sua sessão. Entre com sua conta.',
  checkingSession: 'Verificando sessão…',
  sessionUnavailable:
    'Não foi possível verificar sua sessão. Tente novamente.',
  signedInAs: 'Conectado como {{name}}',
  logout: 'Sair',
  documents: 'Documentos',
  chat: 'Chat',
  loadingDocuments: 'Carregando documentos…',
  noDocuments: 'Nenhum documento ainda.',
  documentsLoadError: 'Não foi possível carregar seus documentos.',
  tryAgain: 'Tentar novamente',
  documentsRefreshError: 'Não foi possível atualizar o status dos documentos.',
  documentStatusPending: 'Pendente',
  documentStatusProcessing: 'Processando',
  documentStatusReady: 'Pronto',
  documentStatusFailed: 'Falhou',
  selectDocument: 'Selecionar documento',
  supportedDocumentFormats:
    'Formatos aceitos: PDF, TXT, DOCX. Tamanho máximo: {{size}} MB.',
  selectedFile: 'Arquivo selecionado: {{name}}',
  upload: 'Enviar',
  uploading: 'Enviando…',
  uploadAccepted: 'Upload aceito. O processamento continuará em segundo plano.',
  unsupportedFileType: 'Tipo de arquivo não suportado. Use PDF, TXT ou DOCX.',
  fileTooLarge: 'O arquivo é muito grande. O tamanho máximo é {{size}} MB.',
  documentUploadInvalid:
    'Não foi possível processar este arquivo. Verifique o formato e tente novamente.',
  documentUploadUnavailable:
    'Não foi possível enviar este arquivo agora. Tente novamente.',
  chatNotConnected: 'O assistente ainda não está conectado.',
}

export default pt
