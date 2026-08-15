/**
 * notificationService.ts
 *
 * Handles sending deployment failure and rollback alerts via Slack and Email.
 * All functions are non-blocking — errors are caught and logged, not propagated.
 *
 * Slack: Uses @slack/webhook for channel messages
 * Email: Uses nodemailer with SMTP configuration from environment variables
 */

import { IncomingWebhook } from '@slack/webhook';
import nodemailer from 'nodemailer';
import { Deployment, Service } from '../types/deployment.types';

// ─── Slack Configuration ──────────────────────────────────────────────────────

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
let slackClient: IncomingWebhook | null = null;

if (slackWebhookUrl) {
  slackClient = new IncomingWebhook(slackWebhookUrl);
}

// ─── Email Configuration ──────────────────────────────────────────────────────

const emailConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  } : undefined,
};

let emailTransporter: nodemailer.Transporter | null = null;

try {
  emailTransporter = nodemailer.createTransport(emailConfig);
} catch (err) {
  console.error('[notificationService] Failed to initialize email transporter:', err);
}

// ─── Slack Functions ──────────────────────────────────────────────────────────

/**
 * Send a deployment failure alert to Slack.
 * Non-blocking — errors are logged but not thrown.
 *
 * @param deployment The failed deployment
 * @param service The service that deployed
 */
export async function sendDeploymentAlert(
  deployment: Deployment,
  service: Service
): Promise<void> {
  if (!slackClient) {
    console.log('[notificationService] Slack webhook URL not configured. Skipping deployment alert.');
    return;
  }

  try {
    const runUrl = `https://github.com/${service.repoUrl}/actions/runs/${deployment.workflowRunId}`;
    const message = {
      text: `🚨 Deployment Failure Detected`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Deployment Failure',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Service:*\n${service.name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Branch:*\n${deployment.branch}`,
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${deployment.conclusion}`,
            },
            {
              type: 'mrkdwn',
              text: `*Triggered by:*\n${deployment.triggeredBy}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Workflow:* ${deployment.workflowName}\n*Repository:* ${service.repoUrl}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Logs',
                emoji: true,
              },
              url: runUrl,
            },
          ],
        },
      ],
    };

    await slackClient.send(message);
    console.log(`[notificationService] Sent deployment alert for ${service.name} to Slack`);
  } catch (err: any) {
    console.error('[notificationService] Failed to send Slack deployment alert:', err.message);
  }
}

/**
 * Send a rollback alert to Slack.
 * Non-blocking — errors are logged but not thrown.
 *
 * @param rollback The rollback data
 * @param service The service that was rolled back
 * @param targetDeployment The deployment being rolled back to
 */
export async function sendRollbackAlert(
  rollback: any,
  service: Service,
  targetDeployment: Deployment
): Promise<void> {
  if (!slackClient) {
    console.log('[notificationService] Slack webhook URL not configured. Skipping rollback alert.');
    return;
  }

  try {
    const message = {
      text: `🔄 Automatic Rollback Triggered`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔄 Automatic Rollback Triggered',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Service:*\n${service.name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Environment:*\n${service.environment}`,
            },
            {
              type: 'mrkdwn',
              text: `*Trigger:*\n${rollback.trigger || 'automatic'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${rollback.status || 'pending'}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Rolling back to:* Deployment ${targetDeployment.id.substring(0, 8)}\n*Branch:* ${targetDeployment.branch}\n*Time:* ${rollback.triggeredAt || new Date().toISOString()}`,
          },
        },
        {
          type: 'divider',
        },
      ],
    };

    await slackClient.send(message);
    console.log(`[notificationService] Sent rollback alert for ${service.name} to Slack`);
  } catch (err: any) {
    console.error('[notificationService] Failed to send Slack rollback alert:', err.message);
  }
}

// ─── Email Functions ──────────────────────────────────────────────────────────

/**
 * Send an email alert.
 * Non-blocking — errors are logged but not thrown.
 *
 * @param subject Email subject line
 * @param htmlBody HTML email body
 * @param to Recipient email address (can be comma-separated)
 */
export async function sendEmailAlert(
  subject: string,
  htmlBody: string,
  to: string
): Promise<void> {
  if (!emailTransporter) {
    console.log('[notificationService] Email transporter not configured. Skipping email alert.');
    return;
  }

  if (!to) {
    console.log('[notificationService] No recipient email address provided. Skipping email alert.');
    return;
  }

  try {
    const from = process.env.ALERT_EMAIL_FROM || 'noreply@sentinel.local';
    
    await emailTransporter.sendMail({
      from,
      to,
      subject,
      html: htmlBody,
    });

    console.log(`[notificationService] Sent email alert to ${to}`);
  } catch (err: any) {
    console.error('[notificationService] Failed to send email alert:', err.message);
  }
}

/**
 * Send a deployment failure email with action buttons.
 * Convenience wrapper around sendEmailAlert.
 *
 * @param deployment The failed deployment
 * @param service The service that deployed
 * @param to Recipient email (from ALERT_EMAIL env var)
 */
export async function sendDeploymentFailureEmail(
  deployment: Deployment,
  service: Service,
  to: string
): Promise<void> {
  const runUrl = `https://github.com/${service.repoUrl}/actions/runs/${deployment.workflowRunId}`;
  const logsUrl = `${process.env.SENTINEL_BASE_URL || 'http://localhost:3000'}/deployments/${deployment.id}/logs`;
  const rollbackUrl = `${process.env.SENTINEL_BASE_URL || 'http://localhost:3000'}/deployments/${deployment.id}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .summary { background: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin-bottom: 20px; }
          .actions { margin: 20px 0; }
          .btn { display: inline-block; padding: 10px 20px; margin-right: 10px; border-radius: 4px; text-decoration: none; color: white; }
          .btn-primary { background: #dc3545; }
          .btn-secondary { background: #6c757d; }
          .footer { font-size: 12px; color: #999; margin-top: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">🚨 Deployment Failure Detected</h1>
          </div>
          
          <div class="summary">
            <h2>Failure Summary</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Service:</td>
                <td style="padding: 8px;">${service.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Branch:</td>
                <td style="padding: 8px;">${deployment.branch}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Workflow:</td>
                <td style="padding: 8px;">${deployment.workflowName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Status:</td>
                <td style="padding: 8px;">${deployment.conclusion}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Triggered by:</td>
                <td style="padding: 8px;">${deployment.triggeredBy}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Time:</td>
                <td style="padding: 8px;">${new Date(deployment.completedAt || deployment.startedAt).toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <div class="actions">
            <a href="${runUrl}" class="btn btn-primary">View Logs on GitHub</a>
            <a href="${logsUrl}" class="btn btn-secondary">View Logs in Sentinel</a>
            <a href="${rollbackUrl}" class="btn btn-primary">Trigger Rollback</a>
          </div>

          <div class="footer">
            <p>This is an automated alert from CI-CD Sentinel.</p>
            <p>Do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmailAlert(
    `🚨 Deployment Failure: ${service.name} - ${deployment.branch}`,
    htmlBody,
    to
  );
}

/**
 * Send a rollback confirmation email.
 * Convenience wrapper around sendEmailAlert.
 *
 * @param service The service that was rolled back
 * @param targetDeployment The deployment being rolled back to
 * @param to Recipient email (from ALERT_EMAIL env var)
 */
export async function sendRollbackEmail(
  service: Service,
  targetDeployment: Deployment,
  to: string
): Promise<void> {
  const statusUrl = `${process.env.SENTINEL_BASE_URL || 'http://localhost:3000'}/deployments/${targetDeployment.id}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .summary { background: #f8f9fa; padding: 15px; border-left: 4px solid #28a745; margin-bottom: 20px; }
          .actions { margin: 20px 0; }
          .btn { display: inline-block; padding: 10px 20px; margin-right: 10px; border-radius: 4px; text-decoration: none; color: white; background: #28a745; }
          .footer { font-size: 12px; color: #999; margin-top: 30px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">🔄 Automatic Rollback Completed</h1>
          </div>
          
          <div class="summary">
            <h2>Rollback Summary</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Service:</td>
                <td style="padding: 8px;">${service.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Environment:</td>
                <td style="padding: 8px;">${service.environment}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Target Branch:</td>
                <td style="padding: 8px;">${targetDeployment.branch}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Target Deployment ID:</td>
                <td style="padding: 8px;">${targetDeployment.id.substring(0, 12)}...</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Completed at:</td>
                <td style="padding: 8px;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <div class="actions">
            <a href="${statusUrl}" class="btn">View Deployment Status</a>
          </div>

          <div class="footer">
            <p>This is an automated alert from CI-CD Sentinel.</p>
            <p>Do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmailAlert(
    `🔄 Automatic Rollback: ${service.name}`,
    htmlBody,
    to
  );
}
