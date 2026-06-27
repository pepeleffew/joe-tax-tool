//
//  AppTab.swift
//  AgentFrame
//
//  A single source of truth describing every primary destination in the
//  app's bottom navigation. Driving the TabView from an enum keeps the
//  navigation declarative, makes the tab order trivial to reorder, and
//  gives every new feature one obvious place to register itself.
//

import SwiftUI

/// The primary, top-level destinations surfaced in the bottom tab bar.
enum AppTab: Int, CaseIterable, Identifiable {
    case home
    case projects
    case templates
    case settings

    var id: Int { rawValue }

    /// The label shown beneath the tab icon.
    var title: String {
        switch self {
        case .home:      return "Home"
        case .projects:  return "Projects"
        case .templates: return "Templates"
        case .settings:  return "Settings"
        }
    }

    /// SF Symbol shown when the tab is not selected.
    var symbol: String {
        switch self {
        case .home:      return "house"
        case .projects:  return "square.stack.3d.up"
        case .templates: return "rectangle.on.rectangle.angled"
        case .settings:  return "gearshape"
        }
    }

    /// Filled SF Symbol variant, used to emphasise the active tab.
    var selectedSymbol: String {
        switch self {
        case .home:      return "house.fill"
        case .projects:  return "square.stack.3d.up.fill"
        case .templates: return "rectangle.on.rectangle.angled.fill"
        case .settings:  return "gearshape.fill"
        }
    }
}
