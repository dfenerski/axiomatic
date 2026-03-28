package com.axiomatic.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class FolderPickerPlugin(private val activity: Activity) : Plugin(activity) {

    private var pendingPickInvoke: Invoke? = null

    @Command
    fun pickFolder(invoke: Invoke) {
        try {
            // On Android 11+, we need MANAGE_EXTERNAL_STORAGE for walkdir/fs access
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
                pendingPickInvoke = invoke
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.data = Uri.parse("package:${activity.packageName}")
                startActivityForResult(invoke, intent, "storagePermissionResult")
                return
            }
            launchFolderPicker(invoke)
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "Failed to open folder picker")
        }
    }

    @ActivityCallback
    fun storagePermissionResult(invoke: Invoke, result: ActivityResult) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
            launchFolderPicker(invoke)
        } else {
            invoke.reject("Storage permission is required to attach directories")
        }
    }

    private fun launchFolderPicker(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        )
        startActivityForResult(invoke, intent, "pickFolderResult")
    }

    @ActivityCallback
    fun pickFolderResult(invoke: Invoke, result: ActivityResult) {
        when (result.resultCode) {
            Activity.RESULT_OK -> {
                val uri = result.data?.data
                if (uri != null) {
                    try {
                        activity.contentResolver.takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        )
                    } catch (_: Exception) {}

                    val path = resolveTreeUri(uri)
                    if (path != null) {
                        val ret = JSObject()
                        ret.put("path", path)
                        invoke.resolve(ret)
                    } else {
                        invoke.reject("Could not resolve directory path from URI: $uri")
                    }
                } else {
                    invoke.reject("No directory selected")
                }
            }
            Activity.RESULT_CANCELED -> invoke.reject("cancelled")
            else -> invoke.reject("Failed to pick folder")
        }
    }

    private fun resolveTreeUri(treeUri: Uri): String? {
        if (!DocumentsContract.isTreeUri(treeUri)) return null

        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val split = docId.split(":")
        if (split.size < 2) return null

        val storageName = split[0]
        val relativePath = split[1]

        return if ("primary".equals(storageName, ignoreCase = true)) {
            val base = Environment.getExternalStorageDirectory().absolutePath
            if (relativePath.isEmpty()) base else "$base/$relativePath"
        } else {
            if (relativePath.isEmpty()) "/storage/$storageName"
            else "/storage/$storageName/$relativePath"
        }
    }
}
