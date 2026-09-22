import type { Translation } from './en'

const de: Translation = {
  languageLabel: 'Sprache',
  brandTagline:
    'Fragen Sie Ihre Dokumente. Sehen Sie, woher die Antwort stammt.',
  brandSpecimenQuestion: 'Wie lang ist die Kündigungsfrist?',
  brandSpecimenAnswer:
    'Der Mietvertrag verlangt 30 Tage Frist in Schriftform.',
  brandSpecimenDocument: 'contrato-locacao-2026.pdf',
  brandSpecimenPage: 'S. {{page}}',
  brandSpecimenContext:
    '9.1 Der MIETER darf die Immobilie jederzeit zurückgeben. ',
  brandSpecimenHighlight:
    'Die vorzeitige Kündigung ist mindestens dreißig Tage im Voraus schriftlich mitzuteilen.',
  signIn: 'Anmelden',
  loginLead:
    'Greifen Sie auf die Dokumentenbasis Ihrer Organisation zu.',
  createAccount: 'Konto erstellen',
  noAccountYet: 'Noch kein Konto?',
  home: 'Startseite',
  email: 'E-Mail',
  password: 'Passwort',
  showPassword: 'Passwort anzeigen',
  hidePassword: 'Passwort verbergen',
  fieldRequired: 'Dieses Feld ist erforderlich.',
  invalidEmailFormat: 'Geben Sie eine gültige E-Mail-Adresse ein.',
  signingIn: 'Anmeldung läuft…',
  invalidCredentials:
    'E-Mail oder Passwort falsch. Bitte prüfen und erneut versuchen.',
  invalidInput: 'Bitte überprüfen Sie Ihre Eingaben.',
  signInUnavailable:
    'Die Anmeldung ist derzeit nicht möglich. Versuchen Sie es erneut.',
  name: 'Name',
  signupLead:
    'Jede Organisation hat eine eigene, von allen anderen getrennte Dokumentenbasis.',
  alreadyHaveAccount: 'Schon ein Konto?',
  confirmPassword: 'Passwort bestätigen',
  passwordHint: 'Mindestens 8 Zeichen.',
  passwordTooShort: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
  passwordMismatch: 'Die Passwörter stimmen nicht überein.',
  creatingAccount: 'Konto wird erstellt…',
  emailAlreadyExists:
    'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  registrationUnavailable:
    'Das Konto konnte derzeit nicht erstellt werden. Versuchen Sie es erneut.',
  accountCreatedSessionFailed:
    'Ihr Konto wurde erstellt, aber die Sitzung konnte nicht gestartet werden. Bitte melden Sie sich an.',
  checkingSession: 'Sitzung wird überprüft…',
  sessionUnavailable:
    'Ihre Sitzung konnte nicht überprüft werden. Versuchen Sie es erneut.',
  signedInAs: 'Angemeldet als {{name}}',
  logout: 'Abmelden',
  documents: 'Dokumente',
  chat: 'Chat',
  loadingDocuments: 'Dokumente werden geladen…',
  noDocuments: 'Noch keine Dokumente.',
  deleteDocumentAction: '{{name}} löschen',
  deleteDocument: 'Löschen',
  deleteDocumentConfirm:
    '{{name}} löschen? Das kann nicht rückgängig gemacht werden.',
  deleteDocumentError:
    'Das Dokument konnte nicht gelöscht werden. Versuchen Sie es erneut.',
  documentsLoadError: 'Ihre Dokumente konnten nicht geladen werden.',
  tryAgain: 'Erneut versuchen',
  documentsRefreshError: 'Der Dokumentstatus konnte nicht aktualisiert werden.',
  documentStatusPending: 'In der Warteschlange',
  documentStatusProcessing: 'Wird verarbeitet',
  documentStatusReady: 'Bereit',
  documentStatusFailed: 'Fehlgeschlagen',
  supportedDocumentFormats:
    'Unterstützte Formate: PDF, TXT, DOCX. Maximale Größe: {{size}} MB.',
  unsupportedFileType:
    'Nicht unterstützter Dateityp. Verwenden Sie PDF, TXT oder DOCX.',
  fileTooLarge:
    'Die Datei ist zu groß. Die maximale Größe beträgt {{size}} MB.',
  documentUploadInvalid:
    'Diese Datei konnte nicht verarbeitet werden. Prüfen Sie das Format und versuchen Sie es erneut.',
  documentUploadUnavailable:
    'Die Datei konnte gerade nicht hochgeladen werden. Versuchen Sie es erneut.',
  addDocuments: 'Hinzufügen',
  dropAnywhereHint:
    'Sie können Dateien auch an beliebiger Stelle hier ablegen.',
  dropzoneTitle: 'Dateien hierher ziehen',
  dropzoneDropping: 'Zum Hochladen loslassen',
  chooseFiles: 'Dateien auswählen',
  uploadingFiles: 'Wird hochgeladen…',
  addDocumentsModalTitle: 'Dokumente hinzufügen',
  addDocumentsModalLead:
    'Dateien stehen für Fragen bereit, sobald die Verarbeitung abgeschlossen ist.',
  filesRejectedTitle: 'Dateien nicht hochgeladen',
  modalCloseHint:
    'Sie können dieses Fenster schließen: Die Verarbeitung läuft im Hintergrund weiter.',
  close: 'Schließen',
  firstRunTitle: 'Laden Sie Ihr erstes Dokument hoch',
  firstRunLead:
    'PDF, TXT oder DOCX. Danach können Sie einfach fragen, und jede Antwort zeigt den Abschnitt, der sie belegt.',
  processingTitle: 'Ihre Dokumente werden verarbeitet',
  processingLead:
    'Sie können fragen, sobald das erste Dokument bereit ist. Sie können diese Seite verlassen: Die Verarbeitung läuft im Hintergrund weiter.',
  askYourDocuments: 'Fragen Sie Ihre Dokumente',
  askYourDocumentsHint:
    'Antworten enthalten stets den Abschnitt, der sie belegt.',
  suggestionsLabel: 'Hier beginnen',
  suggestion1: 'Fassen Sie die hochgeladenen Dokumente zusammen',
  suggestion2: 'Was sind die wichtigsten Punkte?',
  suggestion3: 'Gibt es eine wichtige Frist oder ein Datum?',
  questionLabel: 'Ihre Frage',
  send: 'Senden',
  stop: 'Stoppen',
  composerKeyboardHint:
    'Eingabetaste sendet · Umschalt+Eingabetaste für Zeilenumbruch',
  searchingDocuments_one: 'Suche in {{count}} Dokument',
  searchingDocuments_other: 'Suche in {{count}} Dokumenten',
  answerNotFound:
    'Ich konnte diese Information in Ihren Dokumenten nicht finden.',
  chatUnavailable:
    'Derzeit konnte keine Antwort erzeugt werden. Versuchen Sie es erneut.',
  invalidQuestion:
    'Diese Frage ist ungültig. Prüfen Sie sie und versuchen Sie es erneut.',
  sourcesTitle: 'Quellen dieser Antwort',
  sourcesCount: 'Verwendete Abschnitte: {{count}}',
  sourcePage: 'Seite {{page}}',
  toggleTheme: 'Design wechseln',
  newConversation: 'Neue Unterhaltung',
  loadingConversation: 'Ihre Unterhaltung wird geladen…',
  conversationLoadError: 'Ihre Unterhaltung konnte nicht geladen werden.',
}

export default de
