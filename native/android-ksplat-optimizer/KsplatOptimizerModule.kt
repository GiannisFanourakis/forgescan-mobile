package com.forgescan.ksplat

/**
 * Contract stub for the ForgeScan native .ksplat optimizer.
 *
 * Required React Native method:
 *   runKsplatOptimizer(inputJson: String): Promise<String>
 *
 * This file is intentionally not wired into an Android project yet. It documents
 * the production bridge that a development/native build must implement.
 */
class KsplatOptimizerModule {
  fun runKsplatOptimizer(inputJson: String): String {
    throw NotImplementedError(
      "Native .ksplat optimizer requires a development/native build implementation."
    )
  }
}
