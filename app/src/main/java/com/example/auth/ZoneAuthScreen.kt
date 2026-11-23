package com.example.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.ui.theme.ZoneAmber
import com.example.ui.theme.ZoneBorder
import com.example.ui.theme.ZoneCrimson
import com.example.ui.theme.ZoneGunmetal
import com.example.ui.theme.ZonePanel
import com.example.ui.theme.ZoneTextMuted
import com.example.ui.theme.ZoneTextPrimary
import com.example.ui.theme.ZoneVoid

@Composable
fun ZoneAuthScreen(
    formState: AuthFormState,
    onSelectMode: (AuthMode) -> Unit,
    onUsernameChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onConfirmPasswordChanged: (String) -> Unit,
    onSubmit: () -> Unit
) {
    val focusManager = LocalFocusManager.current
    var showPassword by remember { mutableStateOf(false) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = ZoneAmber,
        unfocusedBorderColor = ZoneBorder,
        focusedLabelColor = ZoneAmber,
        unfocusedLabelColor = ZoneTextMuted,
        cursorColor = ZoneAmber,
        focusedTextColor = ZoneTextPrimary,
        unfocusedTextColor = ZoneTextPrimary,
        focusedContainerColor = ZonePanel,
        unfocusedContainerColor = ZonePanel,
        focusedLeadingIconColor = ZoneAmber,
        unfocusedLeadingIconColor = ZoneTextMuted
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(ZoneGunmetal, ZoneVoid)
                )
            )
            .safeDrawingPadding()
            .imePadding()
            .testTag("auth_screen_root"),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 460.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .border(1.dp, ZoneBorder, RoundedCornerShape(8.dp))
                .background(ZoneGunmetal.copy(alpha = 0.95f), RoundedCornerShape(8.dp))
                .padding(horizontal = 24.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "STALZONE",
                color = ZoneAmber,
                fontSize = 30.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 6.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.auth_subtitle),
                color = ZoneTextMuted,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 1.sp,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(18.dp))

            // Mode switch: Login / Registration
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(ZoneVoid)
                    .border(1.dp, ZoneBorder, RoundedCornerShape(6.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                AuthModeTab(
                    label = stringResource(R.string.auth_tab_login),
                    selected = formState.mode == AuthMode.LOGIN,
                    onClick = { onSelectMode(AuthMode.LOGIN) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("auth_tab_login")
                )
                AuthModeTab(
                    label = stringResource(R.string.auth_tab_register),
                    selected = formState.mode == AuthMode.REGISTER,
                    onClick = { onSelectMode(AuthMode.REGISTER) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("auth_tab_register")
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = formState.username,
                onValueChange = onUsernameChanged,
                label = { Text(stringResource(R.string.auth_label_username)) },
                placeholder = { Text(stringResource(R.string.auth_placeholder_username), color = ZoneTextMuted) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Person,
                        contentDescription = stringResource(R.string.auth_label_username)
                    )
                },
                singleLine = true,
                enabled = !formState.isBusy,
                colors = fieldColors,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Next
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_username_input")
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = formState.password,
                onValueChange = onPasswordChanged,
                label = { Text(stringResource(R.string.auth_label_password)) },
                placeholder = { Text(stringResource(R.string.auth_placeholder_password), color = ZoneTextMuted) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Lock,
                        contentDescription = stringResource(R.string.auth_label_password)
                    )
                },
                trailingIcon = {
                    TextButton(
                        onClick = { showPassword = !showPassword },
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag("toggle_password_visibility")
                    ) {
                        Text(
                            text = if (showPassword) "СКРЫТЬ" else "ПОКАЗ.",
                            color = ZoneAmber,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                singleLine = true,
                enabled = !formState.isBusy,
                visualTransformation = if (showPassword) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                colors = fieldColors,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = if (formState.mode == AuthMode.REGISTER) ImeAction.Next else ImeAction.Done
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    onDone = {
                        focusManager.clearFocus()
                        onSubmit()
                    }
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_password_input")
            )

            if (formState.mode == AuthMode.REGISTER) {
                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = formState.confirmPassword,
                    onValueChange = onConfirmPasswordChanged,
                    label = { Text(stringResource(R.string.auth_label_confirm_password)) },
                    placeholder = {
                        Text(
                            stringResource(R.string.auth_placeholder_confirm_password),
                            color = ZoneTextMuted
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = stringResource(R.string.auth_label_confirm_password)
                        )
                    },
                    singleLine = true,
                    enabled = !formState.isBusy,
                    visualTransformation = if (showPassword) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    colors = fieldColors,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            onSubmit()
                        }
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("register_confirm_password_input")
                )
            }

            if (formState.errorMessage != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZoneCrimson.copy(alpha = 0.16f))
                        .border(1.dp, ZoneCrimson.copy(alpha = 0.7f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                        .testTag("auth_error_banner")
                ) {
                    Text(
                        text = formState.errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Button(
                onClick = {
                    focusManager.clearFocus()
                    onSubmit()
                },
                enabled = !formState.isBusy,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ZoneAmber,
                    contentColor = ZoneVoid,
                    disabledContainerColor = ZoneAmber.copy(alpha = 0.45f),
                    disabledContentColor = ZoneVoid
                ),
                shape = RoundedCornerShape(6.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 50.dp)
                    .testTag("auth_submit_button")
            ) {
                if (formState.isBusy) {
                    CircularProgressIndicator(
                        color = ZoneVoid,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = stringResource(R.string.auth_connecting),
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                } else {
                    Text(
                        text = if (formState.mode == AuthMode.LOGIN) {
                            stringResource(R.string.auth_button_login)
                        } else {
                            stringResource(R.string.auth_button_register)
                        },
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.5.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = stringResource(R.string.auth_footer_note),
                color = ZoneTextMuted,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun AuthModeTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (selected) ZoneAmber else ZoneVoid)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = if (selected) ZoneVoid else ZoneTextMuted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 1.sp
        )
    }
}
