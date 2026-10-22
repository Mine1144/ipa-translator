import Foundation
import Capacitor
import UIKit

/// เครื่องมือจัดการไฟล์ฝั่ง native
/// - บันทึกไฟล์ลง Documents ของแอป (เห็นใน Files.app ได้)
/// - แชร์ไฟล์ผ่าน Share Sheet (AirDrop / Save to Files / แอปอื่น)
/// - อ่าน/ลบ/ดูรายการไฟล์ที่บันทึกไว้
@objc(FileToolsPlugin)
public class FileToolsPlugin: CAPPlugin, CAPBridgedPlugin {

    public var identifier = "FileToolsPlugin"
    public var jsName = "FileToolsPlugin"
    public var pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFiles", returnType: CAPPluginReturnPromise)
    ]

    private var documentsURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// โฟลเดอร์งานของแอป (แยกจากไฟล์อื่น เพื่อให้ลบง่าย)
    private var workURL: URL {
        let dir = documentsURL.appendingPathComponent("Translations", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private func safeName(_ raw: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:*?\"<>|")
        let cleaned = raw.components(separatedBy: invalid).joined(separator: "_")
        return cleaned.isEmpty ? "file.txt" : cleaned
    }

    // MARK: - บันทึก

    @objc func saveFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let content = call.getString("content") else {
            call.reject("ต้องใส่ name และ content")
            return
        }
        let fileName = safeName(name)
        let url = workURL.appendingPathComponent(fileName)
        do {
            try content.write(to: url, atomically: true, encoding: .utf8)
            call.resolve([
                "path": url.path,
                "name": fileName,
                "size": (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            ])
        } catch {
            call.reject("บันทึกไม่สำเร็จ: \(error.localizedDescription)")
        }
    }

    // MARK: - แชร์

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let content = call.getString("content") else {
            call.reject("ต้องใส่ name และ content")
            return
        }
        let fileName = safeName(name)
        let url = workURL.appendingPathComponent(fileName)

        do {
            try content.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            call.reject("บันทึกไม่สำเร็จ: \(error.localizedDescription)")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("ไม่พบหน้าต่างแอป")
                return
            }
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            // iPad ต้องมี popover anchor
            if let popover = activity.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 40, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            activity.completionWithItemsHandler = { _, completed, _, _ in
                call.resolve(["shared": completed, "path": url.path])
            }
            presenter.present(activity, animated: true)
        }
    }

    // MARK: - รายการไฟล์

    @objc func listFiles(_ call: CAPPluginCall) {
        let dir = workURL
        let items = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        var result: [[String: Any]] = []
        for item in items {
            let full = dir.appendingPathComponent(item)
            var isDir: ObjCBool = false
            FileManager.default.fileExists(atPath: full.path, isDirectory: &isDir)
            if isDir.boolValue { continue }
            let attrs = try? FileManager.default.attributesOfItem(atPath: full.path)
            let size = (attrs?[.size] as? Int) ?? 0
            let modified = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
            result.append([
                "name": item,
                "size": size,
                "modified": Int(modified * 1000)
            ])
        }
        result.sort { ($0["modified"] as? Int ?? 0) > ($1["modified"] as? Int ?? 0) }
        call.resolve(["files": result])
    }

    // MARK: - อ่านไฟล์

    @objc func readFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("ต้องใส่ name")
            return
        }
        let url = workURL.appendingPathComponent(safeName(name))
        guard let text = try? String(contentsOf: url, encoding: .utf8) else {
            call.reject("อ่านไฟล์ไม่สำเร็จ: \(name)")
            return
        }
        call.resolve(["name": url.lastPathComponent, "content": text])
    }

    // MARK: - ลบไฟล์

    @objc func deleteFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("ต้องใส่ name")
            return
        }
        let url = workURL.appendingPathComponent(safeName(name))
        do {
            try FileManager.default.removeItem(at: url)
            call.resolve(["deleted": true])
        } catch {
            call.reject("ลบไม่สำเร็จ: \(error.localizedDescription)")
        }
    }

    // MARK: - เปิดตัวเลือกไฟล์ (UIDocumentPicker)

    @objc func pickFiles(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("ไม่พบหน้าต่างแอป")
                return
            }
            let types: [UTType] = [.plainText, .subtitle, .text, .json, .commaSeparatedText, .data]
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            presenter.present(picker, animated: true)
            self.pendingCall = call
        }
    }

    private var pendingCall: CAPPluginCall?

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        var files: [[String: Any]] = []
        for url in urls {
            // ต้องคัดลอกเข้า sandbox ก่อน (ไฟล์ที่เลือกอาจอยู่นอกแอป)
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            let content = (try? String(contentsOf: url, encoding: .utf8))
                ?? (try? String(contentsOf: url, encoding: .utf16))
                ?? ""
            let name = url.lastPathComponent
            let dest = self.workURL.appendingPathComponent(self.safeName(name))
            try? content.write(to: dest, atomically: true, encoding: .utf8)
            files.append(["name": dest.lastPathComponent, "content": content, "size": content.utf8.count])
        }
        call.resolve(["files": files])
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingCall?.resolve(["files": []])
        pendingCall = nil
    }
}
