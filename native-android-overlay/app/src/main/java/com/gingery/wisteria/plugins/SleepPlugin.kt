package com.gingery.wisteria.plugins

import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Bridges Android Health Connect's SleepSessionRecord to JS.
 *
 * Methods:
 *   isAvailable()        — true if Health Connect is installed on device
 *   hasPermission()      — true if READ_SLEEP granted
 *   requestPermission()  — launches the Health Connect permission UI
 *   getLastSleep()       — returns the most recent sleep session within 36h
 *
 * The user's Xiaomi 健康 app writes sleep data into Health Connect, so
 * once permission is granted Wisteria can read it without any direct
 * 小米 integration.
 */
@CapacitorPlugin(name = "Sleep")
class SleepPlugin : Plugin() {

    private val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
    )

    private fun client(): HealthConnectClient? {
        return try {
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                return null
            }
            HealthConnectClient.getOrCreate(context)
        } catch (e: Exception) {
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ok = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        val ret = JSObject()
        ret.put("available", ok)
        call.resolve(ret)
    }

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val c = client()
        if (c == null) {
            val ret = JSObject()
            ret.put("granted", false)
            call.resolve(ret)
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            val granted = try {
                c.permissionController.getGrantedPermissions().containsAll(PERMISSIONS)
            } catch (e: Exception) {
                false
            }
            val ret = JSObject()
            ret.put("granted", granted)
            withContext(Dispatchers.Main) { call.resolve(ret) }
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent: Intent = contract.createIntent(context, PERMISSIONS)
            // Start activity for result through the host activity. The user
            // returns via Health Connect's UI; we don't need the result code
            // here because hasPermission() can re-poll after they're back.
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("无法打开 Health Connect 权限页：${e.message}")
        }
    }

    /** Aggregate today's steps via Health Connect's COUNT_TOTAL metric.
     *  Mi Health / Samsung Health / Fitbit etc. all write into HC, so this
     *  matches whatever number their UI shows, and refreshes on every
     *  call — no background service required. */
    @PluginMethod
    fun getTodaySteps(call: PluginCall) {
        val c = client()
        if (c == null) {
            call.reject("Health Connect 不可用")
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val zone = ZoneId.systemDefault()
                val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
                val now = Instant.now()
                val req = AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
                )
                val resp = c.aggregate(req)
                val total = resp[StepsRecord.COUNT_TOTAL] ?: 0L
                val ret = JSObject()
                ret.put("steps", total)
                withContext(Dispatchers.Main) { call.resolve(ret) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    call.reject("读取步数失败：${e.message}")
                }
            }
        }
    }

    @PluginMethod
    fun getLastSleep(call: PluginCall) {
        val c = client()
        if (c == null) {
            call.reject("Health Connect 不可用")
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val end = Instant.now()
                val start = end.minus(Duration.ofHours(36))
                val req = ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                )
                val resp = c.readRecords(req)
                val last = resp.records.maxByOrNull { it.endTime }
                val ret = JSObject()
                if (last == null) {
                    ret.put("session", JSObject.NULL)
                } else {
                    val s = JSObject()
                    val fmt = DateTimeFormatter.ISO_OFFSET_DATE_TIME
                    s.put("startTime", fmt.format(last.startTime.atZone(ZoneId.systemDefault())))
                    s.put("endTime", fmt.format(last.endTime.atZone(ZoneId.systemDefault())))
                    s.put("durationMinutes",
                        Duration.between(last.startTime, last.endTime).toMinutes())
                    ret.put("session", s)
                }
                withContext(Dispatchers.Main) { call.resolve(ret) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    call.reject("读取睡眠失败：${e.message}")
                }
            }
        }
    }
}
