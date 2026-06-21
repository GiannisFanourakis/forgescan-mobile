import Foundation

/// Contract stub for the ForgeScan native .ksplat optimizer.
///
/// Required React Native method:
///   runKsplatOptimizer(inputJson: String) async throws -> String
///
/// This file is intentionally not wired into an iOS project yet. It documents
/// the production bridge that a development/native build must implement.
final class KsplatOptimizerModule {
  func runKsplatOptimizer(inputJson: String) async throws -> String {
    throw NSError(
      domain: "ForgeScanKsplatOptimizer",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "Native .ksplat optimizer requires a development/native build implementation."
      ]
    )
  }
}
