const en = {
  languageLabel: 'Language',
  signIn: 'Sign in',
  createAccount: 'Create account',
  home: 'Home',
  email: 'Email',
  password: 'Password',
  signingIn: 'Signing in…',
  invalidCredentials: 'Invalid email or password.',
  invalidInput: 'Please check the information you entered.',
  signInUnavailable:
    'We couldn’t sign you in right now. Please try again.',
  name: 'Name',
  creatingAccount: 'Creating account…',
  emailAlreadyExists: 'An account with this email already exists.',
  registrationUnavailable:
    'We couldn’t create your account right now. Please try again.',
  accountCreatedSessionFailed:
    'Your account was created, but we couldn’t start your session. Please sign in.',
  checkingSession: 'Checking session…',
  sessionUnavailable:
    'We couldn’t verify your session. Please try again.',
  signedInAs: 'Signed in as {{name}}',
  logout: 'Log out',
  documents: 'Documents',
  chat: 'Chat',
  loadingDocuments: 'Loading documents…',
  noDocuments: 'No documents yet.',
  documentsLoadError: 'We couldn’t load your documents.',
  tryAgain: 'Try again',
  documentsRefreshError: 'We couldn’t refresh document statuses.',
  documentStatusPending: 'Pending',
  documentStatusProcessing: 'Processing',
  documentStatusReady: 'Ready',
  documentStatusFailed: 'Failed',
  selectDocument: 'Select a document',
  supportedDocumentFormats:
    'Accepted formats: PDF, TXT, DOCX. Maximum size: {{size}} MB.',
  selectedFile: 'Selected file: {{name}}',
  upload: 'Upload',
  uploading: 'Uploading…',
  uploadAccepted:
    'Upload accepted. Processing will continue in the background.',
  unsupportedFileType: 'Unsupported file type. Use PDF, TXT, or DOCX.',
  fileTooLarge: 'File is too large. Maximum size is {{size}} MB.',
  documentUploadInvalid:
    'This file could not be processed. Check the format and try again.',
  documentUploadUnavailable:
    'We couldn’t upload this file right now. Please try again.',
  askYourDocuments: 'Ask a question about your documents.',
  questionLabel: 'Your question',
  send: 'Send',
  sending: 'Sending…',
  answerNotFound: 'I couldn’t find that in your documents.',
  chatUnavailable: 'We couldn’t get an answer right now. Please try again.',
  invalidQuestion: 'This question isn’t valid. Please check it and try again.',
  you: 'You',
  assistant: 'Assistant',
}

export type Translation = typeof en

export default en
