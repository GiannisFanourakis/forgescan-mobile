package com.forgescan.mobile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
internal fun Page(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = AppMuted)
        content()
    }
}

@Composable
internal fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = AppPanel,
        shape = RoundedCornerShape(8.dp),
        tonalElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
internal fun MenuActionButton(
    text: String,
    options: List<Pair<String, () -> Unit>>,
    enabled: Boolean,
    secondary: Boolean = false,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxWidth()) {
        if (secondary) {
            OutlinedButton(
                onClick = { expanded = true },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AppSecondary),
            ) { Text(text) }
        } else {
            Button(
                onClick = { expanded = true },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color(0xFF04222C)),
            ) { Text(text) }
        }
        MenuItems(expanded = expanded, options = options, onDismiss = { expanded = false })
    }
}

@Composable
internal fun ActionButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean,
    secondary: Boolean = false,
) {
    if (secondary) {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AppSecondary),
        ) { Text(text) }
    } else {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color(0xFF04222C)),
        ) { Text(text) }
    }
}

@Composable
internal fun ToolbarMenuButton(
    text: String,
    options: List<Pair<String, () -> Unit>>,
    modifier: Modifier = Modifier,
    secondary: Boolean = false,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        if (secondary) {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AppSecondary),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            ) { Text(text) }
        } else {
            Button(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color(0xFF04222C)),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            ) { Text(text) }
        }
        MenuItems(expanded = expanded, options = options, onDismiss = { expanded = false })
    }
}

@Composable
internal fun RowScope.PreviewButton(text: String, onClick: () -> Unit, secondary: Boolean = false) {
    if (secondary) {
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AppSecondary),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
        ) { Text(text) }
    } else {
        Button(
            onClick = onClick,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color(0xFF04222C)),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
        ) { Text(text) }
    }
}

@Composable
private fun MenuItems(
    expanded: Boolean,
    options: List<Pair<String, () -> Unit>>,
    onDismiss: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        options.forEach { (label, action) ->
            DropdownMenuItem(
                text = { Text(label) },
                onClick = {
                    onDismiss()
                    action()
                },
            )
        }
    }
}
