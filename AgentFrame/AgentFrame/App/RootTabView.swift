//
//  RootTabView.swift
//  AgentFrame
//
//  The root navigation container. Owns the selected-tab state and maps
//  each `AppTab` case to its feature screen. Every tab gets its own
//  `NavigationStack` so navigation state is isolated per tab — the
//  behaviour users expect from a polished iOS app.
//

import SwiftUI

struct RootTabView: View {
    /// The currently selected primary destination. Defaults to Home.
    @State private var selection: AppTab = .home

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                tabContent(for: tab)
                    .tag(tab)
                    .tabItem {
                        Label(
                            tab.title,
                            systemImage: selection == tab ? tab.selectedSymbol : tab.symbol
                        )
                    }
            }
        }
    }

    /// Resolves a tab to its feature screen, each wrapped in its own
    /// navigation stack so back-stacks never leak between tabs.
    @ViewBuilder
    private func tabContent(for tab: AppTab) -> some View {
        NavigationStack {
            switch tab {
            case .home:      HomeView()
            case .projects:  ProjectsView()
            case .templates: TemplatesView()
            case .settings:  SettingsView()
            }
        }
    }
}

#Preview {
    RootTabView()
        .tint(AppColor.brandPrimary)
}
