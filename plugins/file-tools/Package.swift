// swift-tools-version: 5.9
import PackageDescription

// ชื่อ package/product ต้องตรงกับ fixName(npm package name)
// "file-tools-plugin" -> "FileToolsPlugin"
let package = Package(
    name: "FileToolsPlugin",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "FileToolsPlugin",
            targets: ["FileToolsPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3")
    ],
    targets: [
        .target(
            name: "FileToolsPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "ios")
    ]
)
