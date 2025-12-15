
export async function getZoomAccessToken(): Promise<string | null> {
    const accountId = process.env.ZOOM_ACCOUNT_ID
    const clientId = process.env.ZOOM_CLIENT_ID
    const clientSecret = process.env.ZOOM_CLIENT_SECRET

    if (!accountId || !clientId || !clientSecret) {
        console.error('Missing Zoom credentials')
        return null
    }

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    try {
        const response = await fetch(
            `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${authHeader}`,
                },
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Zoom OAuth error:', errorText)
            return null
        }

        const data = await response.json()
        return data.access_token
    } catch (error) {
        console.error('Failed to get Zoom access token:', error)
        return null
    }
}

export async function createZoomMeeting(
    topic: string,
    startTime: string, // ISO format
    durationMinutes: number,
    inviteeEmails: string[] = []
): Promise<{ id: string, join_url: string } | null> {
    const token = await getZoomAccessToken()

    if (!token) {
        return null
    }

    try {
        const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                topic,
                type: 2, // Scheduled meeting
                start_time: startTime,
                duration: durationMinutes,
                timezone: 'America/Los_Angeles', // Hardcoded for this studio as requested
                settings: {
                    join_before_host: false,
                    waiting_room: true,
                    mute_upon_entry: true,
                    auto_recording: 'none',
                    meeting_invitees: inviteeEmails.map(email => ({ email }))
                }
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Zoom create meeting error:', errorText)
            return null
        }

        const data = await response.json()
        return {
            id: String(data.id),
            join_url: data.join_url
        }
    } catch (error) {
        console.error('Failed to create Zoom meeting:', error)
        return null
    }
}


export async function deleteZoomMeeting(meetingId: string): Promise<boolean> {
    const token = await getZoomAccessToken()
    if (!token) return false

    try {
        const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        if (!response.ok && response.status !== 404) { // 404 means already deleted
            const errorText = await response.text()
            console.error('Zoom delete meeting error:', errorText)
            return false
        }

        return true
    } catch (error) {
        console.error('Failed to delete Zoom meeting:', error)
        return false
    }
}

export async function updateZoomMeeting(
    meetingId: string,
    topic: string,
    startTime: string,
    duration: number
): Promise<boolean> {
    const token = await getZoomAccessToken()
    if (!token) return false

    try {
        const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                topic,
                start_time: startTime,
                duration,
                timezone: 'America/Los_Angeles' // Keep consistent
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Zoom update meeting error:', errorText)
            return false
        }

        return true
    } catch (error) {
        console.error('Failed to update Zoom meeting:', error)
        return false
    }
}
