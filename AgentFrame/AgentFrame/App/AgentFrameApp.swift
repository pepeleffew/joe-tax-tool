//
//  AgentFrameApp.swift
//  AgentFrame
//
//  The application entry point. Keeps wiring intentionally thin: it
//  installs the design system and hands control to the root navigation
//  container. Light mode is enforced here, by design, for Build 001.
//

import SwiftUI

@main
struct AgentFrameApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
                // Light mode by default per the Build 001 product spec.
                // Centralised here so individual screens never need to opt in.
                .preferredColorScheme(.light)
                .tint(AppColor.brandPrimary)
        }
    }
}
