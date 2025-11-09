from flask import Flask, jsonify, request
from flask_cors import CORS
from service import service
import json
import asyncio

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

@app.route('/trigger', methods=['POST'])
def trigger():
    data = request.get_json() or {}
    single_run = data.get('single_run', True)
    result = service.start_agent(single_run=single_run)
    return jsonify(result)

@app.route('/stop', methods=['POST'])
def stop():
    result = service.stop_agent()
    return jsonify(result)

@app.route('/logs', methods=['GET'])
def get_logs():
    limit = request.args.get('limit', 100, type=int)
    logs = service.get_logs(limit=limit)
    return jsonify({"logs": logs})

@app.route('/bounties', methods=['GET'])
def get_bounties():
    bounties = service.get_bounties()
    return jsonify({"bounties": bounties})

@app.route('/reputation', methods=['GET'])
def get_reputation():
    agent_address = request.args.get('address')
    # If no address provided, use signing address from service
    if not agent_address:
        agent_address = service.signing_address
    
    if not agent_address:
        return jsonify({
            "reputation": {
                "score": 0,
                "successful_bounties": 0,
                "failed_bounties": 0,
                "total_earned": 0
            },
            "message": "Agent not initialized or no signing address available"
        })
    
    try:
        reputation = asyncio.run(service.get_reputation(agent_address))
        if reputation is None:
            return jsonify({
                "reputation": {
                    "score": 0,
                    "successful_bounties": 0,
                    "failed_bounties": 0,
                    "total_earned": 0
                }
            })
        return jsonify({"reputation": reputation})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    status = service.get_status()
    return jsonify(status)

@app.route('/wallet', methods=['GET'])
def get_wallet():
    cdp_address = service.wallet_address
    signing_address = service.signing_address
    
    if cdp_address or signing_address:
        return jsonify({
            "cdp_wallet_address": cdp_address,
            "signing_address": signing_address,
            "status": "ready",
            "note": "Use signing_address for on-chain transactions and reputation"
        })
    else:
        return jsonify({
            "cdp_wallet_address": None,
            "signing_address": None,
            "status": "not_initialized",
            "message": "Agent wallet not initialized. Start the agent first."
        })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3003, debug=True)

