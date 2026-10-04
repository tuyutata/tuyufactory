// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get hostStorageFailed =>
      'Cannot read or save this device’s host trust. Check app storage access and file integrity; existing files will not be overwritten.';

  @override
  String get hostDiscoveryFailed =>
      'LAN discovery is unavailable. Check this app’s local network permission and connection.';

  @override
  String get hostNotFound =>
      'No factory host found. Ask the host administrator to enable LAN access.';

  @override
  String get hostMultiple =>
      'Multiple factory hosts found. The client cannot automatically select or trust one.';

  @override
  String get hostVerificationFailed =>
      'The fixed host did not pass secure connection checks. Verify host availability, certificate and installation identity.';

  @override
  String get hostConnection => 'Factory host connection';

  @override
  String get hostIdle => 'The factory host is not connected yet.';

  @override
  String get hostDiscovering =>
      'Looking for exactly one LAN factory host. Ask the host administrator to enable LAN access first.';

  @override
  String get hostTrust =>
      'Compare the installation ID and complete certificate fingerprint with the factory host screen before trusting. A LAN advertisement alone is not trusted.';

  @override
  String get hostConnecting =>
      'Verifying the fixed host\'s TLS certificate, hostname and installation identity.';

  @override
  String get hostReady =>
      'The secure host connection is verified. This does not mean an employee is signed in.';

  @override
  String get hostFailed =>
      'The host connection was not verified. Check the network, host access switch and fixed identity. First discovery requires exactly one host; saved host details are never replaced automatically.';

  @override
  String get hostConfirm => 'Details match: trust and connect';

  @override
  String get hostCancel => 'Do not trust yet';

  @override
  String get hostRetry => 'Check host connection';

  @override
  String get appTitle => 'TuyuFactory';

  @override
  String get clientTitle => 'Factory client';

  @override
  String get clientUnavailable =>
      'Employee login, sessions and business features use the host\'s native ERPNext interface. This client does not start the factory business database or host services.';

  @override
  String get openWorkspace => 'Open ERPNext workspace';

  @override
  String get workspaceFailed =>
      'The workspace could not open securely or its connection was interrupted. Check the host and retry.';

  @override
  String get runtimeTitle => 'Local factory system';

  @override
  String get runtimeDescription =>
      'TuyuFactory runs PostgreSQL, Frappe, and ERPNext independently on this computer. The database and internal ports are not exposed.';

  @override
  String get starting => 'Starting';

  @override
  String get ready => 'Ready';

  @override
  String get failed => 'Failed';

  @override
  String get stopped => 'Stopped';

  @override
  String get startingRuntime =>
      'Initializing the factory database and ERPNext. The first start may take a while.';

  @override
  String get runtimeFailed => 'The local factory system failed to start.';

  @override
  String get runtimeReady => 'The local factory system is ready.';

  @override
  String get retry => 'Start again';

  @override
  String get initializeAdministrator =>
      'Initialize the TuyuFactory administrator';

  @override
  String get initializeAdministratorDescription =>
      'Request a local challenge and submit the Tuyu account\'s signed response. ERPNext employee accounts are unchanged.';

  @override
  String get administratorName => 'Administrator name (optional)';

  @override
  String get initialize => 'Initialize';

  @override
  String get citizenSdkTitle => 'CitizenSDK device light node';

  @override
  String get citizenSdkStarting => 'Starting CitizenSDK on this device.';

  @override
  String get citizenSdkReady => 'CitizenSDK is ready on this device.';

  @override
  String get citizenSdkUnavailable =>
      'CitizenSDK is unavailable on this device.';

  @override
  String get citizenSdkRetry => 'Restart CitizenSDK';

  @override
  String citizenSdkCapabilityCount(int count) {
    return 'Ready capabilities: $count';
  }

  @override
  String get walletTitle => 'Wallet setup';

  @override
  String get walletSubtitle =>
      'Create or import a wallet. Keep your recovery phrase and any optional passphrase safe.';

  @override
  String get walletOperationFailed => 'The wallet operation failed. Try again.';

  @override
  String get walletCreate => 'Create wallet';

  @override
  String get walletImport => 'Import wallet';

  @override
  String get walletAddAccount => 'Add account';

  @override
  String get administratorResponse => 'QR_V1 signed response';

  @override
  String get employeeAccess => 'Client connections';

  @override
  String get gatewayUnknown => 'LAN status not confirmed';

  @override
  String get gatewayEnabled => 'LAN access enabled';

  @override
  String get gatewayDisabled => 'LAN access disabled';

  @override
  String get enableGateway => 'Enable LAN access';

  @override
  String get disableGateway => 'Stop LAN access';

  @override
  String get refreshGateway => 'Refresh connection status';

  @override
  String get realtimeUnavailable => 'Upstream realtime service is unavailable.';

  @override
  String get administratorLoginRequired =>
      'Authenticate the local Tuyu administrator to manage LAN access.';

  @override
  String get createChallenge => 'Request administrator challenge';

  @override
  String get administratorLogin => 'Verify and log in';

  @override
  String get instanceId => 'Installation ID';

  @override
  String get certificateSha256 => 'TLS certificate SHA-256 fingerprint';
}
